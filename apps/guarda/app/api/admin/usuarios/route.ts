import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../lib/supabase-admin';


async function autorizarAdministrador(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!token) {
    return { error: 'SesiÃ³n no vÃ¡lida.', status: 401 as const };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { error: 'ConfiguraciÃ³n de Supabase incompleta.', status: 500 as const };
  }

  const supabaseUser = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data: authData, error: authError } =
    await supabaseUser.auth.getUser(token);

  if (authError || !authData.user) {
    return { error: 'SesiÃ³n no vÃ¡lida o vencida.', status: 401 as const };
  }

  const { data: profile, error: profileError } = await supabaseUser
    .from('users')
    .select('id, tenant_id, role, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== 'admin' ||
    profile.is_active !== true ||
    !profile.tenant_id
  ) {
    return { error: 'No tienes permisos de administrador.', status: 403 as const };
  }

  return { user: authData.user, profile };
}

export async function POST(request: NextRequest) {
  try {
    const access = await autorizarAdministrador(request);

    if ('error' in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    const body = await request.json();
    const nombre = String(body.nombre ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const role = String(body.role ?? '');
    const unitId = body.unitId ? String(body.unitId) : null;

    if (!nombre || nombre.length > 120) {
      return NextResponse.json(
        { error: 'Ingresa un nombre vÃ¡lido (mÃ¡ximo 120 caracteres).' },
        { status: 400 }
      );
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return NextResponse.json(
        { error: 'Ingresa un correo electrÃ³nico vÃ¡lido.' },
        { status: 400 }
      );
    }

    if (role !== 'resident' && role !== 'guard') {
      return NextResponse.json(
        { error: 'Solo se pueden invitar residentes o guardias.' },
        { status: 400 }
      );
    }

    if (role === 'resident' && !unitId) {
      return NextResponse.json(
        { error: 'Debes asignar una casa al residente.' },
        { status: 400 }
      );
    }

    if (role === 'guard' && unitId) {
      return NextResponse.json(
        { error: 'Los guardias no deben tener una casa asignada.' },
        { status: 400 }
      );
    }

    if (unitId) {
      const { data: unit, error: unitError } = await supabaseAdmin
        .from('units')
        .select('id, tower_id')
        .eq('id', unitId)
        .maybeSingle();

      if (unitError || !unit) {
        return NextResponse.json(
          { error: 'La casa seleccionada no existe.' },
          { status: 400 }
        );
      }

      const { data: tower, error: towerError } = await supabaseAdmin
        .from('towers')
        .select('id')
        .eq('id', unit.tower_id)
        .eq('tenant_id', access.profile.tenant_id)
        .maybeSingle();

      if (towerError || !tower) {
        return NextResponse.json(
          { error: 'La casa no pertenece a tu conjunto.' },
          { status: 403 }
        );
      }

      const { data: occupied, error: occupiedError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('tenant_id', access.profile.tenant_id)
        .eq('unit_id', unitId)
        .eq('role', 'resident')
        .eq('is_active', true)
        .limit(1);

      if (occupiedError) {
        return NextResponse.json(
          { error: 'No fue posible validar la disponibilidad de la casa.' },
          { status: 500 }
        );
      }

      if (occupied && occupied.length > 0) {
        return NextResponse.json(
          { error: 'Esta casa ya tiene un residente activo asignado.' },
          { status: 409 }
        );
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const redirectTo = new URL('/auth/confirm', siteUrl).toString();

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: nombre },
        redirectTo,
      });

    if (inviteError || !inviteData.user) {
      return NextResponse.json(
        { error: inviteError?.message || 'No fue posible enviar la invitaciÃ³n.' },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        tenant_id: access.profile.tenant_id,
        role,
        full_name: nombre,
        email,
        unit_id: unitId,
        is_active: true,
      })
      .eq('id', inviteData.user.id);

    if (updateError) {
      await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id);

      return NextResponse.json(
        { error: 'Se enviÃ³ la invitaciÃ³n, pero no fue posible completar el perfil. Se intentÃ³ cancelar la cuenta. ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'InvitaciÃ³n enviada correctamente.',
      userId: inviteData.user.id,
    });
  } catch (error) {
    console.error('Error al invitar usuario:', error);
    return NextResponse.json(
      { error: 'Error interno al procesar la invitaciÃ³n.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await autorizarAdministrador(request);

    if ('error' in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    const body = await request.json();
    const userId = String(body.userId ?? '');
    const isActive = body.is_active;

    if (!userId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'Datos de actualizaciÃ³n incompletos.' },
        { status: 400 }
      );
    }

    if (userId === access.user.id) {
      return NextResponse.json(
        { error: 'No puedes desactivar tu propia cuenta.' },
        { status: 400 }
      );
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, role, unit_id')
      .eq('id', userId)
      .eq('tenant_id', access.profile.tenant_id)
      .maybeSingle();

    if (
      targetError ||
      !target ||
      (target.role !== 'resident' && target.role !== 'guard')
    ) {
      return NextResponse.json(
        { error: 'Usuario no encontrado o fuera de tu conjunto.' },
        { status: 404 }
      );
    }

    if (isActive && target.role === 'resident' && target.unit_id) {
      const { data: occupied, error: occupiedError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('tenant_id', access.profile.tenant_id)
        .eq('unit_id', target.unit_id)
        .eq('role', 'resident')
        .eq('is_active', true)
        .neq('id', target.id)
        .limit(1);

      if (occupiedError) {
        return NextResponse.json(
          { error: 'No fue posible validar la disponibilidad de la casa.' },
          { status: 500 }
        );
      }

      if (occupied && occupied.length > 0) {
        return NextResponse.json(
          { error: 'No se puede reactivar: la casa ya tiene otro residente activo.' },
          { status: 409 }
        );
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ is_active: isActive })
      .eq('id', target.id)
      .eq('tenant_id', access.profile.tenant_id);

    if (updateError) {
      return NextResponse.json(
        { error: 'No fue posible actualizar el estado: ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: isActive ? 'Usuario activado.' : 'Usuario desactivado.',
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    return NextResponse.json(
      { error: 'Error interno al actualizar el usuario.' },
      { status: 500 }
    );
  }
}

