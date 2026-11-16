'use client';

import { getHouseNumber } from '../../lib/house-number';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

type Role = 'resident' | 'guard';

type Usuario = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  unit_id: string | null;
  is_active: boolean;
};

type Unidad = {
  id: string;
  code: string;
  tower_id: string;
};

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('resident');
  const [unitId, setUnitId] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [filtroRole, setFiltroRole] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        throw new Error('Tu sesión no está activa. Inicia sesión nuevamente.');
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('users')
        .select('tenant_id, role, is_active')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (
        perfilError ||
        !perfil ||
        perfil.role !== 'admin' ||
        perfil.is_active !== true ||
        !perfil.tenant_id
      ) {
        throw new Error('No tienes permisos para administrar usuarios.');
      }

      const { data: towers, error: towersError } = await supabase
        .from('towers')
        .select('id')
        .eq('tenant_id', perfil.tenant_id);

      if (towersError) throw towersError;

      const towerIds = (towers || []).map((tower: { id: string }) => tower.id);

      let unidadesData: Unidad[] = [];

      if (towerIds.length > 0) {
        const { data, error: unitsError } = await supabase
          .from('units')
          .select('id, code, tower_id')
          .in('tower_id', towerIds);

        if (unitsError) throw unitsError;

        unidadesData = ((data || []) as Unidad[]).sort(
          (a, b) => {
            const numeroA = Number(a.code.replace(/\D/g, ''));
            const numeroB = Number(b.code.replace(/\D/g, ''));
            return numeroA - numeroB;
          }
        );
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email, role, unit_id, is_active')
        .eq('tenant_id', perfil.tenant_id)
        .in('role', ['resident', 'guard'])
        .order('full_name');

      if (usersError) throw usersError;

      setUnidades(unidadesData);
      setUsuarios((usersData || []) as Usuario[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const unidadesPorId = useMemo(
    () => new Map(unidades.map((unidad) => [unidad.id, unidad.code])),
    [unidades]
  );

  const usuariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return usuarios.filter((usuario) => {
      const codigoCasa = usuario.unit_id
        ? getHouseNumber(unidadesPorId.get(usuario.unit_id) || '')
        : '';

      const coincideBusqueda =
        !termino ||
        usuario.full_name.toLowerCase().includes(termino) ||
        usuario.email.toLowerCase().includes(termino) ||
        codigoCasa.toLowerCase().includes(termino);

      const coincideRole =
        filtroRole === 'todos' || usuario.role === filtroRole;

      const coincideEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'activos' && usuario.is_active) ||
        (filtroEstado === 'inactivos' && !usuario.is_active);

      return coincideBusqueda && coincideRole && coincideEstado;
    });
  }, [usuarios, busqueda, filtroRole, filtroEstado, unidadesPorId]);

  async function enviarInvitacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuardando(true);
    setError('');
    setMensaje('');

    try {
      if (role === 'resident' && !unitId) {
        throw new Error('Selecciona la casa del residente.');
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      }

      const response = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          nombre,
          email,
          role,
          unitId: role === 'resident' ? unitId : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'No fue posible enviar la invitación.');
      }

      setMensaje('Invitación enviada correctamente al correo indicado.');
      setNombre('');
      setEmail('');
      setRole('resident');
      setUnitId('');
      setMostrarFormulario(false);

      await cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar la invitación.');
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(usuario: Usuario) {
    const nuevoEstado = !usuario.is_active;
    const accion = nuevoEstado ? 'activar' : 'desactivar';

    if (!window.confirm(`¿Confirmas ${accion} la cuenta de ${usuario.full_name}?`)) {
      return;
    }

    setActualizandoId(usuario.id);
    setError('');
    setMensaje('');

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      }

      const response = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          userId: usuario.id,
          is_active: nuevoEstado,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'No fue posible actualizar la cuenta.');
      }

      setMensaje(result.message || 'Estado actualizado.');
      await cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la cuenta.');
    } finally {
      setActualizandoId(null);
    }
  }

  const activos = usuarios.filter((usuario) => usuario.is_active).length;
  const residentes = usuarios.filter((usuario) => usuario.role === 'resident').length;
  const guardias = usuarios.filter((usuario) => usuario.role === 'guard').length;

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de usuarios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Administración de residentes y guardias del conjunto
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError('');
            setMensaje('');
            setMostrarFormulario(!mostrarFormulario);
          }}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {mostrarFormulario ? 'Cancelar' : '+ Invitar usuario'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Total de cuentas</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{usuarios.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Activas</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{activos}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Residentes</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{residentes}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Guardias</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{guardias}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {mensaje}
        </div>
      )}

      {mostrarFormulario && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Invitar nuevo usuario</h2>
            <p className="mt-1 text-sm text-slate-500">
              El usuario recibirá un correo para establecer su acceso.
            </p>
          </div>

          <form onSubmit={enviarInvitacion} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Nombre completo
              </span>
              <input
                required
                maxLength={120}
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-600"
                placeholder="Nombre del usuario"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Correo electrónico
              </span>
              <input
                required
                type="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-600"
                placeholder="correo@ejemplo.com"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Tipo de usuario
              </span>
              <select
                value={role}
                onChange={(event) => {
                  const nextRole = event.target.value as Role;
                  setRole(nextRole);
                  if (nextRole === 'guard') setUnitId('');
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="resident">Residente</option>
                <option value="guard">Guardia</option>
              </select>
            </label>

            {role === 'resident' && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Casa
                </span>
                <select
                  required
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Seleccionar casa</option>
                  {unidades.map((unidad) => {
                    const ocupada = usuarios.some(
                      (usuario) =>
                        usuario.role === 'resident' &&
                        usuario.is_active &&
                        usuario.unit_id === unidad.id
                    );

                    return (
                      <option key={unidad.id} value={unidad.id} disabled={ocupada}>
                        Casa {getHouseNumber(unidad.code)}{ocupada ? ' — Ocupada' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

            {role === 'guard' && (
              <div className="flex items-end text-sm text-slate-500">
                Los guardias no requieren una casa asignada.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {guardando ? 'Enviando invitación...' : 'Enviar invitación'}
              </button>
              <button
                type="button"
                onClick={() => setMostrarFormulario(false)}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row">
          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por nombre, correo o casa..."
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <select
            value={filtroRole}
            onChange={(event) => setFiltroRole(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="todos">Todos los perfiles</option>
            <option value="resident">Residentes</option>
            <option value="guard">Guardias</option>
          </select>

          <select
            value={filtroEstado}
            onChange={(event) => setFiltroEstado(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="todos">Todos los estados</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>

          <button
            type="button"
            onClick={() => void cargarDatos()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Cargando usuarios...
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No se encontraron usuarios con esos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Usuario</th>
                  <th className="px-4 py-3 font-semibold">Perfil</th>
                  <th className="px-4 py-3 font-semibold">Vivienda</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuariosFiltrados.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{usuario.full_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{usuario.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {usuario.role === 'resident' ? 'Residente' : 'Guardia'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {usuario.role === 'resident' && usuario.unit_id
                        ? `Casa ${unidadesPorId.get(usuario.unit_id) || '—'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          usuario.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {usuario.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={actualizandoId === usuario.id}
                        onClick={() => void cambiarEstado(usuario)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                          usuario.is_active
                            ? 'border border-red-200 text-red-700 hover:bg-red-50'
                            : 'border border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {actualizandoId === usuario.id
                          ? 'Procesando...'
                          : usuario.is_active
                            ? 'Desactivar'
                            : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Mostrando {usuariosFiltrados.length} de {usuarios.length} usuarios.
        </div>
      </section>
    </main>
  );
}

