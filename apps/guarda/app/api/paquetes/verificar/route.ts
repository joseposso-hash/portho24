import { NextRequest, NextResponse } from 'next/server';
import { authorizePackageUser, digestPackagePin, jsonError, supabaseAdmin } from '../_lib';

export async function POST(request: NextRequest) {
  const access = await authorizePackageUser(request);
  if ('error' in access) return jsonError(access.error, access.status);
  if (access.profile.role !== 'guard') return jsonError('Solo vigilancia puede validar la entrega.', 403);
  try {
    const body = await request.json();
    const packageId = String(body.packageId ?? '');
    const pin = String(body.pin ?? '');
    const pickup = body.pickup === true;
    if (!/^[0-9a-f-]{36}$/i.test(packageId) || !/^\d{6}$/.test(pin)) return jsonError('Datos de validación no válidos.', 400);
    const { data, error } = await supabaseAdmin.rpc('verify_package_pin', {
      p_tenant_id: access.profile.tenant_id,
      p_guard_id: access.profile.id,
      p_package_id: packageId,
      p_pin_digest: digestPackagePin(pin),
      p_pickup: pickup,
    });
    if (error) {
      console.error('verify_package_pin:', error);
      return jsonError('No fue posible validar el PIN.', 500);
    }
    if (data?.success !== true) return jsonError(data?.message || 'PIN inválido, vencido o paquete no disponible.', 400);
    if (pickup) return NextResponse.json({ success: true, message: 'Paquete entregado correctamente.' });
    const { data: pack } = await supabaseAdmin.from('packages').select('id, courier, photo_url, status')
      .eq('id', packageId).eq('tenant_id', access.profile.tenant_id).eq('status', 'received').maybeSingle();
    if (!pack) return jsonError('El paquete ya no está disponible.', 409);
    return NextResponse.json({ success: true, package: pack });
  } catch (error) {
    console.error('Error validando PIN:', error);
    return jsonError('Error interno al validar el PIN.', 500);
  }
}
