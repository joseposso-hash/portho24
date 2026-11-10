import { NextRequest, NextResponse } from 'next/server';
import { authorizePackageUser, digestPackagePin, jsonError, supabaseAdmin } from '../_lib';

export async function POST(request: NextRequest) {
  const access = await authorizePackageUser(request);
  if (!access.ok) return jsonError(access.error, access.status);
  if (access.profile.role !== 'guard') return jsonError('Solo vigilancia puede validar la entrega.', 403);

  try {
    const body = await request.json();
    let packageId = String(body.packageId ?? '');
    const packageRef = String(body.packageRef ?? '').toLowerCase();
    const pin = String(body.pin ?? '');
    const pickup = body.pickup === true;

    if (!packageId && /^[0-9a-f]{8}$/.test(packageRef)) {
      const { data: pending, error: lookupError } = await supabaseAdmin
        .from('packages')
        .select('id')
        .eq('tenant_id', access.profile.tenant_id)
        .in('status', ['received', 'notified']);

      if (lookupError) {
        console.error('lookup package reference:', lookupError);
        return jsonError('No fue posible localizar el paquete.', 500);
      }

      const matches = (pending || []).filter((item: { id: string }) =>
        item.id.replace(/-/g, '').toLowerCase().endsWith(packageRef)
      );
      if (matches.length === 1) packageId = matches[0].id;
      else return jsonError('Referencia inexistente o no única.', 404);
    }

    if (!/^[0-9a-f-]{36}$/i.test(packageId) || !/^\d{6}$/.test(pin)) {
      return jsonError('Datos de validación no válidos.', 400);
    }

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

    // La función SQL devuelve { result: ... }, no { success: ... }.
    const result = data?.result;

    if (result === 'unauthorized') {
      return jsonError('El guarda ya no está autorizado para esta operación.', 403);
    }
    if (result === 'locked') {
      return NextResponse.json(
        { error: 'Se alcanzó el límite de intentos. Intenta nuevamente después del bloqueo.' },
        { status: 429, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (pickup) {
      if (result !== 'picked_up') {
        return jsonError('El paquete ya no está disponible o el PIN no es válido.', 409);
      }
      return NextResponse.json(
        { success: true, message: 'Paquete entregado correctamente.' },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (result !== 'valid') {
      return jsonError('PIN inválido, vencido o paquete no disponible.', 400);
    }

    const { data: pack, error: packageError } = await supabaseAdmin
      .from('packages')
      .select('id, courier, photo_url, status')
      .eq('id', packageId)
      .eq('tenant_id', access.profile.tenant_id)
      .in('status', ['received', 'notified'])
      .maybeSingle();

    if (packageError) {
      console.error('load verified package:', packageError);
      return jsonError('No fue posible cargar los datos del paquete.', 500);
    }
    if (!pack) return jsonError('El paquete ya no está disponible.', 409);

    return NextResponse.json(
      { success: true, package: pack },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error validando PIN:', error);
    return jsonError('Error interno al validar el PIN.', 500);
  }
}
