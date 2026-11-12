import { NextRequest, NextResponse } from 'next/server';
import {
  authorizePackageUser,
  createPackagePin,
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

export async function POST(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);
    if (!access.ok) return response({ error: access.error }, access.status);

    if (access.profile.role !== 'guard') {
      return response({
        error: 'Solo el personal de vigilancia puede registrar paquetes.',
      }, 403);
    }

    const parsed = await readLimitedJson(request, 16 * 1024);

    if (!parsed.ok) {
      return response({
        error: parsed.status === 413
          ? 'La solicitud supera el tamaño permitido.'
          : 'La información enviada no es válida.',
      }, parsed.status);
    }

    const body = parsed.body;
    const unitId = String(body.unitId ?? '');
    const courier = String(body.courier ?? '').trim();
    const tracking = String(body.tracking ?? '').trim();
    const photoUrl = String(body.photoUrl ?? '').trim();

    if (
      !unitId ||
      !courier ||
      courier.length > 80 ||
      tracking.length > 120 ||
      !photoUrl
    ) {
      return response({
        error: 'Completa los datos obligatorios del paquete.',
      }, 400);
    }

    const privateMatch = photoUrl.match(
      /^storage:\/\/evidences-private\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/paquetes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/i
    );

    const isPrivatePhoto =
      !!privateMatch &&
      privateMatch[1].toLowerCase() ===
        access.profile.tenant_id.toLowerCase();

    if (!isPrivatePhoto) {
      return response({
        error: 'La fotografía debe pertenecer al almacenamiento privado de este conjunto.',
      }, 400);
    }

    const { data: unit, error: unitError } = await supabaseAdmin
      .from('units')
      .select('id, tower_id')
      .eq('id', unitId)
      .maybeSingle();

    if (unitError || !unit) {
      return response({ error: 'La casa seleccionada no existe.' }, 400);
    }

    const { data: tower, error: towerError } = await supabaseAdmin
      .from('towers')
      .select('id')
      .eq('id', unit.tower_id)
      .eq('tenant_id', access.profile.tenant_id)
      .maybeSingle();

    if (towerError || !tower) {
      return response({
        error: 'La casa no pertenece a tu conjunto.',
      }, 403);
    }

    const pin = createPackagePin();
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabaseAdmin.rpc(
      'register_package_with_pin',
      {
        p_tenant_id: access.profile.tenant_id,
        p_guard_id: access.profile.id,
        p_recipient_unit_id: unitId,
        p_courier: courier,
        p_tracking_number: tracking || null,
        p_photo_url: photoUrl,
        p_pin_digest: pin.digest,
        p_pin_ciphertext: pin.ciphertext,
        p_pin_iv: pin.iv,
        p_pin_auth_tag: pin.authTag,
        p_expires_at: expiresAt,
      }
    );

    if (error || data?.success !== true) {
      console.error('register_package_with_pin:', error || data);
      return response({
        error: 'No fue posible registrar el paquete.',
      }, 500);
    }

    return response({
      success: true,
      packageId: data.package_id,
      message: 'Paquete registrado. El PIN está disponible únicamente para el residente.',
    });
  } catch (error) {
    console.error('Error registrando paquete:', error);
    return response({
      error: 'Error interno al registrar el paquete.',
    }, 500);
  }
}
