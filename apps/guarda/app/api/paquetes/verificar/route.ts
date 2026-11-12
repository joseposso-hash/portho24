import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  authorizePackageUser,
  digestPackagePin,
  supabaseAdmin,
} from '../_lib';

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readLimitedJson(
  request: NextRequest,
  maxBytes: number
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: 400 | 413 }
> {
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, status: 400 };
    }

    return {
      ok: true,
      body: parsed as Record<string, unknown>,
    };
  } catch {
    return { ok: false, status: 400 };
  }
}

async function eliminarFirma(path: string | null) {
  if (!path) return;

  try {
    await supabaseAdmin.storage
      .from('package-signatures')
      .remove([path]);
  } catch (error) {
    console.error('No fue posible eliminar la firma temporal:', error);
  }
}

export async function POST(request: NextRequest) {
  const access = await authorizePackageUser(request);

  if (!access.ok) {
    return response({ error: access.error }, access.status);
  }

  if (access.profile.role !== 'guard') {
    return response({
      error: 'Solo vigilancia puede validar la entrega.',
    }, 403);
  }

  let uploadedPath: string | null = null;

  try {
    const parsed = await readLimitedJson(request, 750 * 1024);

    if (!parsed.ok) {
      return response({
        error: parsed.status === 413
          ? 'La solicitud o imagen de firma supera el tamaño permitido.'
          : 'La información enviada no es válida.',
      }, parsed.status);
    }

    const body = parsed.body;
    const pin = String(body.pin ?? '');
    const pickup = body.pickup === true;

    if (!/^\d{6}$/.test(pin)) {
      return response({
        error: 'Ingresa un PIN válido de 6 dígitos.',
      }, 400);
    }

    let signatureUrl: string | null = null;

    if (pickup) {
      const signature = typeof body.signature === 'string'
        ? body.signature
        : '';

      const match = signature.match(
        /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/
      );

      if (!match) {
        return response({
          error: 'Debes adjuntar la firma del residente.',
        }, 400);
      }

      const image = Buffer.from(match[1], 'base64');
      const pngHeader = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);

      if (
        image.length < 100 ||
        image.length > 512 * 1024 ||
        image.toString('base64') !== match[1] ||
        !image.subarray(0, 8).equals(pngHeader)
      ) {
        return response({
          error: 'La imagen de firma no es válida.',
        }, 400);
      }

      uploadedPath =
        `${access.profile.tenant_id}/firmas/${randomUUID()}.png`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('package-signatures')
        .upload(uploadedPath, image, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Error almacenando firma:', uploadError);
        uploadedPath = null;

        return response({
          error: 'No fue posible guardar la firma.',
        }, 500);
      }

      signatureUrl = uploadedPath;
    }

    const rpcName = pickup
      ? 'complete_package_pickup_with_signature'
      : 'verify_package_pin_by_digest';

    const rpcParams = pickup
      ? {
          p_tenant_id: access.profile.tenant_id,
          p_guard_id: access.profile.id,
          p_pin_digest: digestPackagePin(pin),
          p_signature_url: signatureUrl,
        }
      : {
          p_tenant_id: access.profile.tenant_id,
          p_guard_id: access.profile.id,
          p_pin_digest: digestPackagePin(pin),
          p_pickup: false,
        };

    const { data, error } = await supabaseAdmin.rpc(
      rpcName,
      rpcParams
    );

    if (error) {
      console.error(`${rpcName}:`, error);
      await eliminarFirma(uploadedPath);
      uploadedPath = null;

      return response({
        error: 'No fue posible procesar la entrega.',
      }, 500);
    }

    const result = data?.result;

    if (result === 'unauthorized') {
      await eliminarFirma(uploadedPath);
      uploadedPath = null;

      return response({
        error: 'El guarda ya no está autorizado.',
      }, 403);
    }

    if (result === 'locked') {
      await eliminarFirma(uploadedPath);
      uploadedPath = null;

      return response({
        error: 'Se alcanzó el límite de intentos. Intenta nuevamente después del bloqueo.',
      }, 429);
    }

    if (pickup) {
      if (result !== 'picked_up') {
        await eliminarFirma(uploadedPath);
        uploadedPath = null;

        return response({
          error: 'El PIN no es válido o el paquete ya no está disponible.',
        }, 409);
      }

      // La firma quedó asociada al paquete.
      uploadedPath = null;

      return response({
        success: true,
        message: 'Paquete entregado correctamente.',
      });
    }

    if (result !== 'valid' || !data?.package) {
      return response({
        error: 'PIN inválido, vencido o paquete no disponible.',
      }, 400);
    }

    return response({
      success: true,
      package: data.package,
    });
  } catch (error) {
    console.error('Error validando PIN:', error);
    await eliminarFirma(uploadedPath);

    return response({
      error: 'Error interno al validar el PIN.',
    }, 500);
  }
}
