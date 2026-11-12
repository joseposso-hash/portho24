import { NextRequest, NextResponse } from 'next/server';
import {
  authorizePackageUser,
  supabaseAdmin,
} from '../../paquetes/_lib';

const REF_PATTERN =
  /^storage:\/\/evidences-private\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(paquetes|visitantes|conductores|vehiculos)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/i;

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

export async function POST(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);
    if (!access.ok) {
      return response({ error: access.error }, access.status);
    }

    const parsed = await readLimitedJson(request, 8 * 1024);

    if (!parsed.ok) {
      return response({
        error: parsed.status === 413
          ? 'La solicitud supera el tamaño permitido.'
          : 'La información enviada no es válida.',
      }, parsed.status);
    }

    const ref = String(parsed.body.ref ?? '');
    const match = REF_PATTERN.exec(ref);

    if (!match) {
      return response({
        error: 'Referencia de evidencia no válida.',
      }, 400);
    }

    const [, tenantId, category] = match;

    if (
      tenantId.toLowerCase() !==
      access.profile.tenant_id.toLowerCase()
    ) {
      return response({
        error: 'No tienes acceso a esta evidencia.',
      }, 403);
    }

    const role = access.profile.role;
    let allowed = false;

    if (role === 'resident') {
      if (category === 'paquetes' && access.profile.unit_id) {
        const { data, error } = await supabaseAdmin
          .from('packages')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('recipient_unit_id', access.profile.unit_id)
          .eq('photo_url', ref)
          .limit(1);

        if (error) {
          console.error('Error comprobando evidencia del residente:', error);
          return response({
            error: 'No fue posible verificar el acceso a la fotografía.',
          }, 500);
        }

        allowed = !!data?.length;
      }
    } else if (role === 'admin' || role === 'guard') {
      if (category === 'paquetes') {
        const { data, error } = await supabaseAdmin
          .from('packages')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('photo_url', ref)
          .limit(1);

        if (error) {
          console.error('Error comprobando fotografía del paquete:', error);
          return response({ error: 'No fue posible verificar la evidencia.' }, 500);
        }

        allowed = !!data?.length;
      } else if (category === 'visitantes') {
        const { data, error } = await supabaseAdmin
          .from('visits')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('photo_url', ref)
          .limit(1);

        if (error) {
          console.error('Error comprobando fotografía de visita:', error);
          return response({ error: 'No fue posible verificar la evidencia.' }, 500);
        }

        allowed = !!data?.length;
      } else {
        const column = category === 'conductores'
          ? 'driver_photo_url'
          : 'photo_url';

        const { data, error } = await supabaseAdmin
          .from('parking_sessions')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq(column, ref)
          .limit(1);

        if (error) {
          console.error('Error comprobando fotografía de parqueadero:', error);
          return response({ error: 'No fue posible verificar la evidencia.' }, 500);
        }

        allowed = !!data?.length;
      }
    }

    if (!allowed) {
      return response({
        error: 'No tienes autorización para consultar esta fotografía.',
      }, 403);
    }

    const path = ref.replace('storage://evidences-private/', '');

    const { data, error } = await supabaseAdmin.storage
      .from('evidences-private')
      .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      console.error('Error firmando evidencia:', error);
      return response({
        error: 'No fue posible consultar la fotografía.',
      }, 404);
    }

    return response({
      success: true,
      url: data.signedUrl,
    });
  } catch (error) {
    console.error('Error API evidencias/leer:', error);
    return response({
      error: 'Error interno al consultar la evidencia.',
    }, 500);
  }
}
