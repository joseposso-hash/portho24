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

  if (!token) return { error: 'Sesi├│n no v├ílida.', status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { error: 'Configuraci├│n de Supabase incompleta.', status: 500 };
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: auth, error: authError } = await client.auth.getUser(token);

  if (authError || !auth.user) {
    return { error: 'Sesi├│n no v├ílida o vencida.', status: 401 };
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
    return 'Ingresa un nombre v├ílido (m├íximo 120 caracteres).';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return 'Ingresa un correo electr├│nico v├ílido.';
  }

  if (phone.length > 30) {
    return 'El tel├®fono no puede superar 30 caracteres.';
  }

  return null;
}

async function limpiarInvitacionIncompleta(userId: string, etapa: string) {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error(`No se pudo anular la invitación (${etapa}):`, error);
      return { deleted: false, error: error.message };
    }

    return { deleted: true, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';

    console.error(`Error compensando invitación (${etapa}):`, error);
    return { deleted: false, error: message };
  }
}
export async function GET(request: NextRequest) {
  try {
    const access = await autorizar(request);
    if ('error' in access) {
      return respuestaError(access.error, access.status);
    }

    const tenantId = access.profile.tenant_id;

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('housing_model')
      .eq('id', tenantId)
      .maybeSingle();

    // Compatibilidad temporal mientras se aplica la migración del modelo de vivienda.
    if (tenantError && !['42703', 'PGRST204'].includes(tenantError.code)) throw tenantError;
    const housingModel = tenantError ? 'houses' : tenant?.housing_model || 'houses';

    const { data: towers, error: towersError } = await supabaseAdmin
      .from('towers')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name');

    if (towersError) throw towersError;

    const towerIds = (towers || []).map((tower: { id: string }) => tower.id);
    const towerNames = new Map(
      (towers || []).map((tower: { id: string; name: string }) => [tower.id, tower.name])
    );
    let units: any[] = [];

    if (towerIds.length) {
      const { data, error } = await supabaseAdmin
        .from('units')
        .select('id, code, tower_id')
        .in('tower_id', towerIds)
        .order('code');

      if (error) throw error;
      units = (data || []).map((unit: any) => ({
        ...unit,
        tower_name: towerNames.get(unit.tower_id) || '',
      }));
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
      housingModel,
      history: history || [],
    });
  } catch (error) {
    console.error('Error GET hogares:', error);
    return respuestaError(
      'No fue posible cargar la informaci├│n de hogares.',
      500
    );
  }
}

export async function POST(request: NextRequest) {
  let invitedUserId: string | null = null;
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
      return respuestaError('Selecciona una casa y un rol del hogar v├ílido.');
    }

    const validUnit = await validarCasa(unitId, access.profile.tenant_id);

    if (!validUnit) {
      return respuestaError('La vivienda no existe o no pertenece a tu conjunto.', 403);
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
        inviteError?.message || 'No fue posible enviar la invitaci├│n.',
        409
      );
    }

    const userId = invite.user.id;
    invitedUserId = userId;

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

      const cleanup = await limpiarInvitacionIncompleta(userId, 'perfil');
      invitedUserId = null;

      if (cleanup.deleted) {
        return respuestaError(
          'No se pudo completar el perfil. La nueva invitación fue anulada; puedes intentarlo nuevamente.',
          500
        );
      }

      return respuestaError(
        `No se pudo completar el perfil ni anular la invitación. Cuenta Auth: ${userId}. Requiere revisión administrativa. Error: ${cleanup.error}`,
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

      const cleanup = await limpiarInvitacionIncompleta(userId, 'asignación');
      invitedUserId = null;

      if (cleanup.deleted) {
        return respuestaError(
          'La asignación no se completó y la nueva invitación fue anulada. Puedes corregir los datos e intentarlo nuevamente.',
          409
        );
      }

      return respuestaError(
        `La asignación falló y no se pudo anular la invitación. Cuenta Auth: ${userId}. No vuelvas a invitar este correo; requiere revisión administrativa. Error de asignación: ${assignError.message}. Error de anulación: ${cleanup.error}`,
        409
      );
    }

    invitedUserId = null;

    return NextResponse.json({
      success: true,
      message: 'Invitaci├│n enviada y residente asignado correctamente.',
      userId,
    });
  } catch (error) {
    console.error('Error POST hogares:', error);

    if (invitedUserId) {
      const cleanup = await limpiarInvitacionIncompleta(
        invitedUserId,
        'error inesperado'
      );

      if (!cleanup.deleted) {
        return respuestaError(
          `Ocurrió un error y no se pudo anular la invitación. Cuenta Auth: ${invitedUserId}. Requiere revisión administrativa. Error: ${cleanup.error}`,
          500
        );
      }
    }

    return respuestaError('Error interno al crear el residente. Si la invitación fue anulada, puedes intentarlo nuevamente.', 500);
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

    // Finalizar la ocupaci├│n completa de una casa.
    if (action === 'close_household') {
      const unitId = String(body.unitId ?? '');
      const endReason = String(
        body.endReason ?? 'Cambio de ocupantes'
      ).trim();

      if (!unitId || !endReason || endReason.length > 250) {
        return respuestaError('Selecciona una casa e indica un motivo v├ílido.');
      }

      const validUnit = await validarCasa(
        unitId,
        access.profile.tenant_id
      );

      if (!validUnit) {
        return respuestaError('La vivienda no pertenece a tu conjunto.', 403);
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
        message: `Ocupaci├│n finalizada. Cuentas desactivadas: ${
          data?.deactivated_count ?? 0
        }.`,
        result: data,
      });
    }

    const userId = String(body.userId ?? '');

    if (!userId) {
      return respuestaError('No se indic├│ el residente.');
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
            'Fall├│ la actualizaci├│n del perfil y tambi├®n su restauraci├│n en Auth. Se requiere revisi├│n administrativa.',
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
        message: 'Residente desactivado y asignaci├│n cerrada en el historial.',
      });
    }

    // Reingreso expl├¡cito de una persona anterior.
    if (action === 'reentry') {
      if (target.is_active) {
        return respuestaError('Esta cuenta ya est├í activa.');
      }

      const unitId = String(body.unitId ?? '');
      const householdRole = String(body.householdRole ?? '');

      if (!unitId || !['titular', 'integrante'].includes(householdRole)) {
        return respuestaError('Selecciona una casa y un rol v├ílido.');
      }

      const validUnit = await validarCasa(
        unitId,
        access.profile.tenant_id
      );

      if (!validUnit) {
        return respuestaError('La vivienda no pertenece a tu conjunto.', 403);
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
        message: 'Reingreso registrado. Se abri├│ un nuevo periodo en el historial.',
      });
    }

    return respuestaError('Acci├│n no reconocida.');
  } catch (error) {
    console.error('Error PATCH hogares:', error);
    return respuestaError('Error interno al actualizar hogares.', 500);
  }
}
