import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../lib/supabase-admin';

type ResultadoAutorizacion =
  | { error: string; status: 401 | 403 | 500 }
  | {
      user: { id: string };
      profile: {
        id: string;
        tenant_id: string;
        role: string;
        is_active: boolean;
      };
    };

async function autorizar(request: NextRequest): Promise<ResultadoAutorizacion> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!token) return { error: 'Sesión no válida.', status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { error: 'Configuración de Supabase incompleta.', status: 500 };
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: auth, error: authError } = await client.auth.getUser(token);

  if (authError || !auth.user) {
    return { error: 'Sesión no válida o vencida.', status: 401 };
  }

  const { data: profile, error } = await client
    .from('users')
    .select('id, tenant_id, role, is_active')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (
    error ||
    !profile ||
    profile.role !== 'admin' ||
    profile.is_active !== true ||
    !profile.tenant_id
  ) {
    return { error: 'No tienes permisos de administrador.', status: 403 };
  }

  return { user: auth.user, profile };
}

function respuestaError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function validarCasa(unitId: string, tenantId: string) {
  if (!unitId) return false;

  const { data: unit, error: unitError } = await supabaseAdmin
    .from('units')
    .select('id, tower_id')
    .eq('id', unitId)
    .maybeSingle();

  if (unitError || !unit) return false;

  const { data: tower, error: towerError } = await supabaseAdmin
    .from('towers')
    .select('id')
    .eq('id', unit.tower_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return !towerError && !!tower;
}

function validarDatosPersonales(nombre: string, email: string, phone: string) {
  if (!nombre || nombre.length > 120) {
    return 'Ingresa un nombre válido (máximo 120 caracteres).';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return 'Ingresa un correo electrónico válido.';
  }

  if (phone.length > 30) {
    return 'El teléfono no puede superar 30 caracteres.';
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const access = await autorizar(request);
    if ('error' in access) {
      return respuestaError(access.error, access.status);
    }

    const tenantId = access.profile.tenant_id;

    const { data: towers, error: towersError } = await supabaseAdmin
      .from('towers')
      .select('id')
      .eq('tenant_id', tenantId);

    if (towersError) throw towersError;

    const towerIds = (towers || []).map((tower: { id: string }) => tower.id);
    let units: any[] = [];

    if (towerIds.length) {
      const { data, error } = await supabaseAdmin
        .from('units')
        .select('id, code, tower_id')
        .in('tower_id', towerIds);

      if (error) throw error;
      units = data || [];
    }

    const { data: residents, error: residentsError } = await supabaseAdmin
      .from('users')
      .select(
        'id, full_name, email, phone, tenant_id, unit_id, role, household_role, is_active, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('role', 'resident')
      .order('full_name');

    if (residentsError) throw residentsError;

    const { data: history, error: historyError } = await supabaseAdmin
      .from('resident_household_history')
      .select(
        'id, user_id, unit_id, household_role, started_at, ended_at, assigned_by, ended_by, end_reason'
      )
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false });

    if (historyError) throw historyError;

    return NextResponse.json({
      residents: residents || [],
      units,
      history: history || [],
    });
  } catch (error) {
    console.error('Error GET hogares:', error);
    return respuestaError(
      'No fue posible cargar la información de hogares.',
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await autorizar(request);
    if ('error' in access) {
      return respuestaError(access.error, access.status);
    }

    const body = await request.json();

    const nombre = String(body.nombre ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const unitId = String(body.unitId ?? '');
    const householdRole = String(body.householdRole ?? '');

    const validationError = validarDatosPersonales(nombre, email, phone);
    if (validationError) return respuestaError(validationError);

    if (!unitId || !['titular', 'integrante'].includes(householdRole)) {
      return respuestaError('Selecciona una casa y un rol del hogar válido.');
    }

    const validUnit = await validarCasa(unitId, access.profile.tenant_id);

    if (!validUnit) {
      return respuestaError('La casa no existe o no pertenece a tu conjunto.', 403);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const redirectTo = new URL('/auth/confirm', siteUrl).toString();

    const { data: invite, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: nombre },
        redirectTo,
      });

    if (inviteError || !invite.user) {
      return respuestaError(
        inviteError?.message || 'No fue posible enviar la invitación.',
        409
      );
    }

    const userId = invite.user.id;

    const { error: profileError } = await supabaseAdmin
      .from('users')
      .update({
        full_name: nombre,
        email,
        phone: phone || null,
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error guardando perfil invitado:', profileError);
      return respuestaError(
        'La invitación fue creada, pero no se pudo completar el perfil. Revisa la cuenta antes de volver a invitar.',
        500
      );
    }

    const { error: assignError } = await supabaseAdmin.rpc(
      'admin_assign_resident',
      {
        p_user_id: userId,
        p_tenant_id: access.profile.tenant_id,
        p_unit_id: unitId,
        p_household_role: householdRole,
        p_actor_id: access.user.id,
      }
    );

    if (assignError) {
      console.error('Error asignando nuevo residente:', assignError);
      return respuestaError(
        'La invitación fue creada, pero la asignación no se completó: ' +
          assignError.message +
          '. Revisa esta cuenta antes de repetir la invitación.',
        409
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Invitación enviada y residente asignado correctamente.',
      userId,
    });
  } catch (error) {
    console.error('Error POST hogares:', error);
    return respuestaError('Error interno al crear el residente.', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await autorizar(request);
    if ('error' in access) {
      return respuestaError(access.error, access.status);
    }

    const body = await request.json();
    const action = String(body.action ?? '');

    // Finalizar la ocupación completa de una casa.
    if (action === 'close_household') {
      const unitId = String(body.unitId ?? '');
      const endReason = String(
        body.endReason ?? 'Cambio de ocupantes'
      ).trim();

      if (!unitId || !endReason || endReason.length > 250) {
        return respuestaError('Selecciona una casa e indica un motivo válido.');
      }

      const validUnit = await validarCasa(
        unitId,
        access.profile.tenant_id
      );

      if (!validUnit) {
        return respuestaError('La casa no pertenece a tu conjunto.', 403);
      }

      const { data, error } = await supabaseAdmin.rpc(
        'admin_close_household',
        {
          p_tenant_id: access.profile.tenant_id,
          p_unit_id: unitId,
          p_actor_id: access.user.id,
          p_end_reason: endReason,
        }
      );

      if (error) {
        console.error('Error cerrando hogar:', error);
        return respuestaError(error.message, 409);
      }

      return NextResponse.json({
        success: true,
        message: `Ocupación finalizada. Cuentas desactivadas: ${
          data?.deactivated_count ?? 0
        }.`,
        result: data,
      });
    }

    const userId = String(body.userId ?? '');

    if (!userId) {
      return respuestaError('No se indicó el residente.');
    }

    if (userId === access.user.id) {
      return respuestaError('No puedes modificar tu propia cuenta.');
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, role, is_active, email, full_name, phone')
      .eq('id', userId)
      .eq('tenant_id', access.profile.tenant_id)
      .eq('role', 'resident')
      .maybeSingle();

    if (targetError || !target) {
      return respuestaError('Residente no encontrado en tu conjunto.', 404);
    }

    // Editar los datos de la misma persona.
    if (action === 'edit') {
      const nombre = String(body.nombre ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const phone = String(body.phone ?? '').trim();

      const validationError = validarDatosPersonales(nombre, email, phone);
      if (validationError) return respuestaError(validationError);

      const { data: authData, error: authReadError } =
        await supabaseAdmin.auth.admin.getUserById(userId);

      if (authReadError || !authData.user) {
        return respuestaError('No fue posible verificar la cuenta de acceso.', 409);
      }

      const oldAuthEmail = authData.user.email;
      const oldUserMetadata = authData.user.user_metadata ?? {};

      const { error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email,
          user_metadata: { ...oldUserMetadata, full_name: nombre },
        });

      if (authUpdateError) {
        return respuestaError(
          'No fue posible actualizar la cuenta de acceso: ' +
            authUpdateError.message,
          409
        );
      }

      const { error: profileUpdateError } = await supabaseAdmin
        .from('users')
        .update({
          full_name: nombre,
          email,
          phone: phone || null,
        })
        .eq('id', userId)
        .eq('tenant_id', access.profile.tenant_id);

      if (profileUpdateError) {
        const { error: rollbackError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            ...(oldAuthEmail ? { email: oldAuthEmail } : {}),
            user_metadata: oldUserMetadata,
          });

        if (rollbackError) {
          console.error('Error restaurando cuenta Auth:', rollbackError);
          return respuestaError(
            'Falló la actualización del perfil y también su restauración en Auth. Se requiere revisión administrativa.',
            500
          );
        }

        return respuestaError(
          'No fue posible guardar los datos del residente: ' +
            profileUpdateError.message,
          500
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Datos personales actualizados correctamente.',
      });
    }
    // Desactivar una sola persona.
    if (action === 'deactivate') {
      const { error } = await supabaseAdmin.rpc(
        'admin_deactivate_resident',
        {
          p_user_id: userId,
          p_tenant_id: access.profile.tenant_id,
          p_actor_id: access.user.id,
        }
      );

      if (error) return respuestaError(error.message, 409);

      return NextResponse.json({
        success: true,
        message: 'Residente desactivado y asignación cerrada en el historial.',
      });
    }

    // Reingreso explícito de una persona anterior.
    if (action === 'reentry') {
      if (target.is_active) {
        return respuestaError('Esta cuenta ya está activa.');
      }

      const unitId = String(body.unitId ?? '');
      const householdRole = String(body.householdRole ?? '');

      if (!unitId || !['titular', 'integrante'].includes(householdRole)) {
        return respuestaError('Selecciona una casa y un rol válido.');
      }

      const validUnit = await validarCasa(
        unitId,
        access.profile.tenant_id
      );

      if (!validUnit) {
        return respuestaError('La casa no pertenece a tu conjunto.', 403);
      }

      const { error } = await supabaseAdmin.rpc(
        'admin_assign_resident',
        {
          p_user_id: userId,
          p_tenant_id: access.profile.tenant_id,
          p_unit_id: unitId,
          p_household_role: householdRole,
          p_actor_id: access.user.id,
        }
      );

      if (error) return respuestaError(error.message, 409);

      return NextResponse.json({
        success: true,
        message: 'Reingreso registrado. Se abrió un nuevo periodo en el historial.',
      });
    }

    return respuestaError('Acción no reconocida.');
  } catch (error) {
    console.error('Error PATCH hogares:', error);
    return respuestaError('Error interno al actualizar hogares.', 500);
  }
}
