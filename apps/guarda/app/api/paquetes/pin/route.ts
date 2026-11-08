import { NextRequest, NextResponse } from 'next/server';
import { authorizePackageUser, decryptPackagePin, jsonError, supabaseAdmin } from '../_lib';

export async function POST(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);
    if ('error' in access) return jsonError(access.error, access.status);
    if (access.profile.role !== 'resident' || !access.profile.unit_id) return jsonError('Solo el residente asignado puede consultar este PIN.', 403);

    const body = await request.json();
    const packageId = String(body.packageId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(packageId)) return jsonError('Paquete no válido.', 400);

    const { data: pack } = await supabaseAdmin.from('packages')
      .select('id, tenant_id, recipient_unit_id, status')
      .eq('id', packageId).eq('tenant_id', access.profile.tenant_id)
      .eq('recipient_unit_id', access.profile.unit_id).eq('status', 'received').maybeSingle();
    if (!pack) return jsonError('El paquete no está disponible para esta cuenta.', 404);

    const { data: secret } = await supabaseAdmin.from('package_pin_secrets')
      .select('pin_ciphertext, pin_iv, pin_auth_tag, expires_at')
      .eq('package_id', pack.id).eq('tenant_id', access.profile.tenant_id).maybeSingle();
    if (!secret || new Date(secret.expires_at).getTime() <= Date.now()) {
      return jsonError('El PIN venció o ya no está disponible. Contacta a vigilancia.', 410);
    }

    const pin = decryptPackagePin(secret.pin_ciphertext, secret.pin_iv, secret.pin_auth_tag);
    return NextResponse.json({ success: true, pin, packageRef: pack.id.replace(/-/g, '').slice(-8) });
  } catch (error) {
    console.error('Error consultando PIN del residente:', error);
    return jsonError('No fue posible consultar el PIN.', 500);
  }
}
