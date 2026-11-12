import { NextRequest, NextResponse } from 'next/server';
import {
  authorizePackageUser,
  createPackagePin,
  supabaseAdmin,
} from '../_lib';

const MAX_BODY_BYTES = 8 * 1024;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Authorization',
    },
  });
}

async function readLimitedJson(request: NextRequest): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);

  if (contentLength > MAX_BODY_BYTES) {
    throw new Error('BODY_TOO_LARGE');
  }

  if (!request.body) throw new Error('INVALID_BODY');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_BODY');
  }

  return parsed as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);

    if (!access.ok) return response({ error: access.error }, access.status);

    if (access.profile.role !== 'resident' || !access.profile.unit_id) {
      return response(
        { error: 'Solo un residente activo puede regenerar PIN.' },
        403
      );
    }

    const body = await readLimitedJson(request);
    const packageId = String(body.packageId ?? '');

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packageId)) {
      return response({ error: 'Identificador de paquete no válido.' }, 400);
    }

    const pin = createPackagePin();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin.rpc('regenerate_package_pin', {
      p_tenant_id: access.profile.tenant_id,
      p_resident_id: access.profile.id,
      p_package_id: packageId,
      p_pin_digest: pin.digest,
      p_pin_ciphertext: pin.ciphertext,
      p_pin_iv: pin.iv,
      p_pin_auth_tag: pin.authTag,
      p_expires_at: expiresAt,
    });

    if (error) {
      console.error('regenerate_package_pin:', error);
      return response({ error: 'No fue posible regenerar el PIN.' }, 500);
    }

    if (data?.result === 'rate_limited') {
      return response(
        { error: 'Límite alcanzado: máximo 3 regeneraciones cada 15 minutos.' },
        429
      );
    }

    if (data?.result === 'unauthorized') {
      return response({ error: 'Residente no autorizado.' }, 403);
    }

    if (data?.result !== 'success') {
      return response(
        { error: 'El paquete ya no está disponible para regenerar el PIN.' },
        409
      );
    }

    return response({
      success: true,
      message: 'PIN regenerado correctamente.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'BODY_TOO_LARGE') {
      return response({ error: 'La solicitud supera el tamaño permitido.' }, 413);
    }

    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'INVALID_BODY')) {
      return response({ error: 'Solicitud no válida.' }, 400);
    }

    console.error('Error regenerando PIN:', error);
    return response({ error: 'Error interno al regenerar el PIN.' }, 500);
  }
}
