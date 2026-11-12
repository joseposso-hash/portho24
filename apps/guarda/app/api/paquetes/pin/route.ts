import { NextRequest, NextResponse } from 'next/server';
import {
  authorizePackageUser,
  decryptPackagePin,
  supabaseAdmin,
} from '../_lib';

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

export async function POST(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);

    if (!access.ok) {
      return response({ error: access.error }, access.status);
    }

    if (access.profile.role !== 'resident' || !access.profile.unit_id) {
      return response({
        error: 'Solo el residente asignado puede consultar estos PIN.',
      }, 403);
    }

    const { data: allowed, error: limitError } =
      await supabaseAdmin.rpc('consume_package_pin_resident_request', {
        p_tenant_id: access.profile.tenant_id,
        p_resident_id: access.profile.id,
      });

    if (limitError) {
      console.error('resident PIN rate limit:', limitError);
      return response({ error: 'No fue posible verificar la solicitud.' }, 500);
    }

    if (allowed !== true) {
      return response({
        error: 'Has alcanzado el límite de consultas. Intenta nuevamente en un minuto.',
      }, 429);
    }

    const { data: packages, error: packagesError } =
      await supabaseAdmin
        .from('packages')
        .select('id, courier, tracking_number, photo_url, status, created_at')
        .eq('tenant_id', access.profile.tenant_id)
        .eq('recipient_unit_id', access.profile.unit_id)
        .in('status', ['received', 'notified'])
        .order('created_at', { ascending: false });

    if (packagesError) {
      console.error('resident packages:', packagesError);
      return response({ error: 'No fue posible consultar los paquetes.' }, 500);
    }

    if (!packages?.length) {
      return response({ success: true, pins: {} });
    }

    const packageIds = packages.map((pack: { id: string }) => pack.id);

    const { data: secrets, error: secretsError } =
      await supabaseAdmin
        .from('package_pin_secrets')
        .select('package_id, pin_ciphertext, pin_iv, pin_auth_tag, expires_at')
        .eq('tenant_id', access.profile.tenant_id)
        .in('package_id', packageIds);

    if (secretsError) {
      console.error('resident package PIN secrets:', secretsError);
      return response({ error: 'No fue posible consultar los PIN.' }, 500);
    }

    const now = Date.now();
    const pins: Record<string, string> = {};

    for (const secret of secrets ?? []) {
      if (new Date(secret.expires_at).getTime() <= now) continue;

      try {
        pins[secret.package_id] = decryptPackagePin(
          secret.pin_ciphertext,
          secret.pin_iv,
          secret.pin_auth_tag
        );
      } catch (error) {
        console.error(
          'No fue posible descifrar el PIN del paquete:',
          secret.package_id,
          error
        );
      }
    }

    return response({ success: true, pins });
  } catch (error) {
    console.error('Error consultando PIN del residente:', error);
    return response({ error: 'No fue posible consultar los PIN.' }, 500);
  }
}
