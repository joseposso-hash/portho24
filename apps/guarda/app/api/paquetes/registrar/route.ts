import { NextRequest, NextResponse } from 'next/server';
import { authorizePackageUser, createPackagePin, jsonError, supabaseAdmin } from '../_lib';

export async function POST(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);
    if (!access.ok) return jsonError(access.error, access.status);
    if (access.profile.role !== 'guard') return jsonError('Solo el personal de vigilancia puede registrar paquetes.', 403);

    const body = await request.json();
    const unitId = String(body.unitId ?? '');
    const courier = String(body.courier ?? '').trim();
    const tracking = String(body.tracking ?? '').trim();
    const photoUrl = String(body.photoUrl ?? '').trim();

    if (!unitId || !courier || courier.length > 80 || tracking.length > 120 || !photoUrl) {
      return jsonError('Completa los datos obligatorios del paquete.', 400);
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return jsonError('Configuración de almacenamiento incompleta.', 500);
    let parsedPhoto: URL;
    let expected: URL;
    try {
      parsedPhoto = new URL(photoUrl);
      expected = new URL(supabaseUrl);
    } catch {
      return jsonError('La dirección de la fotografía no es válida.', 400);
    }
    if (parsedPhoto.origin !== expected.origin || !parsedPhoto.pathname.includes('/storage/v1/object/public/evidences/')) {
      return jsonError('La fotografía no corresponde al almacenamiento autorizado.', 400);
    }

    const { data: unit } = await supabaseAdmin.from('units').select('id, tower_id').eq('id', unitId).maybeSingle();
    if (!unit) return jsonError('La casa seleccionada no existe.', 400);
    const { data: tower } = await supabaseAdmin.from('towers').select('id').eq('id', unit.tower_id).eq('tenant_id', access.profile.tenant_id).maybeSingle();
    if (!tower) return jsonError('La casa no pertenece a tu conjunto.', 403);

    const pin = createPackagePin();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin.rpc('register_package_with_pin', {
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
    });
    if (error || data?.success !== true) {
      console.error('register_package_with_pin:', error || data);
      return jsonError('No fue posible registrar el paquete.', 500);
    }
    return NextResponse.json({ success: true, packageId: data.package_id, message: 'Paquete registrado. El PIN está disponible únicamente para el residente.' });
  } catch (error) {
    console.error('Error registrando paquete:', error);
    return jsonError('Error interno al registrar el paquete.', 500);
  }
}
