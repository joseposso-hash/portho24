'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { formatUnitLabel, getHousingConfig, type HousingModel } from '../../lib/tenant-config';

type Unit = { id: string; code: string; tower_id: string; tower_name?: string };

type Resident = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  unit_id: string | null;
  household_role: 'titular' | 'integrante' | null;
  is_active: boolean;
  created_at: string;
};

type History = {
  id: string;
  user_id: string;
  unit_id: string;
  household_role: string;
  started_at: string;
  ended_at: string | null;
  end_reason?: string | null;
};

type Draft = {
  unitId: string;
  householdRole: 'titular' | 'integrante';
};

type EditDraft = {
  nombre: string;
  email: string;
  phone: string;
};

export default function AdminResidentes() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [housingModel, setHousingModel] = useState<HousingModel>('houses');
  const housing = getHousingConfig(housingModel);
  const [history, setHistory] = useState<History[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [busyUnit, setBusyUnit] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');

  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState('');

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [unitId, setUnitId] = useState('');
  const [householdRole, setHouseholdRole] =
    useState<'titular' | 'integrante'>('titular');

  const [editDraft, setEditDraft] = useState<EditDraft>({
    nombre: '',
    email: '',
    phone: '',
  });

  const unitMap = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units]
  );

  const unitLabel = (unit?: Unit | null) =>
    unit ? formatUnitLabel(unit.code, unit.tower_name, housingModel) : housing.singular;

  const getToken = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    }

    return data.session.access_token;
  }, []);

  const request = useCallback(async (method: string, body?: unknown) => {
    const token = await getToken();

    const response = await fetch('/api/admin/residentes', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || 'No fue posible completar la operación.'
      );
    }

    return result;
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await request('GET');

      setResidents(data.residents || []);
      setHousingModel((data.housingModel || 'units') as HousingModel);

      setUnits(
        (data.units || []).sort((a: Unit, b: Unit) =>
          (a.tower_name || '').localeCompare(b.tower_name || '', 'es', { numeric: true }) ||
          String(a.code).localeCompare(String(b.code), 'es', { numeric: true })
        )
      );

      setHistory(data.history || []);

      const nextDrafts: Record<string, Draft> = {};

      for (const resident of (data.residents || []) as Resident[]) {
        nextDrafts[resident.id] = {
          unitId: resident.unit_id || '',
          householdRole: resident.household_role || 'integrante',
        };
      }

      setDrafts(nextDrafts);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar los hogares.'
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeResidents = useMemo(
    () => residents.filter((resident) => resident.is_active),
    [residents]
  );

  const inactiveResidents = useMemo(
    () => residents.filter((resident) => !resident.is_active),
    [residents]
  );

  const filteredResidents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return residents.filter((resident) => {
      const home = resident.unit_id
        ? unitLabel(unitMap.get(resident.unit_id))
        : '';

      const matchesSearch =
        !term ||
        resident.full_name.toLowerCase().includes(term) ||
        (resident.email || '').toLowerCase().includes(term) ||
        (resident.phone || '').toLowerCase().includes(term) ||
        home.toLowerCase().includes(term);

      const matchesFilter =
        filter === 'todos' ||
        (filter === 'activos' && resident.is_active) ||
        (filter === 'inactivos' && !resident.is_active);

      return matchesSearch && matchesFilter;
    });
  }, [residents, search, filter, unitMap, housingModel, housing.singular]);

  const visibleIds = useMemo(
    () => new Set(filteredResidents.map((resident) => resident.id)),
    [filteredResidents]
  );

  const occupiedHouses = useMemo(() => {
    return units
      .map((unit) => ({
        unit,
        residents: activeResidents.filter(
          (resident) => resident.unit_id === unit.id
        ),
      }))
      .filter(
        (group) =>
          group.residents.length > 0 &&
          group.residents.some((resident) => visibleIds.has(resident.id))
      );
  }, [units, activeResidents, visibleIds]);

  const activeWithoutHouse = filteredResidents.filter(
    (resident) => resident.is_active && !resident.unit_id
  );

  const visibleInactive = filteredResidents.filter(
    (resident) => !resident.is_active
  );

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const result = await request('POST', {
        nombre,
        email,
        phone,
        unitId,
        householdRole,
      });

      setMessage(result.message || 'Invitación enviada correctamente.');

      setNombre('');
      setEmail('');
      setPhone('');
      setUnitId('');
      setHouseholdRole('titular');
      setShowForm(false);

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible enviar la invitación.'
      );
    } finally {
      setSaving(false);
    }
  }

  function startEditing(resident: Resident) {
    setEditingId(resident.id);
    setEditDraft({
      nombre: resident.full_name || '',
      email: resident.email || '',
      phone: resident.phone || '',
    });
    setError('');
    setMessage('');
  }

  async function saveEdit(resident: Resident) {
    setBusyId(resident.id);
    setError('');
    setMessage('');

    try {
      const result = await request('PATCH', {
        action: 'edit',
        userId: resident.id,
        ...editDraft,
      });

      setMessage(result.message || 'Datos personales actualizados.');
      setEditingId('');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible actualizar los datos.'
      );
    } finally {
      setBusyId('');
    }
  }

  async function deactivate(resident: Resident) {
    const confirmed = window.confirm(
      `¿Desactivar a ${resident.full_name}?\n\nSe cerrará su asignación y se conservará su historial. La cuenta no será eliminada.`
    );

    if (!confirmed) return;

    setBusyId(resident.id);
    setError('');
    setMessage('');

    try {
      const result = await request('PATCH', {
        action: 'deactivate',
        userId: resident.id,
      });

      setMessage(result.message || 'Residente desactivado.');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible desactivar al residente.'
      );
    } finally {
      setBusyId('');
    }
  }

  async function reentry(resident: Resident) {
    const draft = drafts[resident.id];

    if (!draft?.unitId) {
      setError('Selecciona la vivienda para registrar el reingreso.');
      return;
    }

    const confirmed = window.confirm(
      `¿Registrar el reingreso de ${resident.full_name}?\n\nEsta operación reactiva su cuenta anterior. Úsala únicamente si se trata de la misma persona.`
    );

    if (!confirmed) return;

    setBusyId(resident.id);
    setError('');
    setMessage('');

    try {
      const result = await request('PATCH', {
        action: 'reentry',
        userId: resident.id,
        unitId: draft.unitId,
        householdRole: draft.householdRole,
      });

      setMessage(result.message || 'Reingreso registrado correctamente.');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible registrar el reingreso.'
      );
    } finally {
      setBusyId('');
    }
  }

  async function closeHousehold(unit: Unit, houseResidents: Resident[]) {
    const homeLabel = unitLabel(unit);

    const confirmed = window.confirm(
      `¿Finalizar la ocupación de ${homeLabel}?\n\nSe desactivarán ${houseResidents.length} cuenta(s) residente(s) activa(s), se cerrarán sus asignaciones y se conservará el historial.\n\nEsta operación no elimina cuentas ni registros históricos.`
    );

    if (!confirmed) return;

    setBusyUnit(unit.id);
    setError('');
    setMessage('');

    try {
      const result = await request('PATCH', {
        action: 'close_household',
        unitId: unit.id,
        endReason: 'Cambio de ocupantes',
      });

      setMessage(
        result.message || `Ocupación de ${homeLabel} finalizada.`
      );

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible finalizar la ocupación.'
      );
    } finally {
      setBusyUnit('');
    }
  }

  const activeCount = activeResidents.length;
  const inactiveCount = inactiveResidents.length;
  const titularCount = activeResidents.filter(
    (resident) => resident.household_role === 'titular'
  ).length;

  function residentCard(resident: Resident) {
    const isEditing = editingId === resident.id;
    const busy = busyId === resident.id;
    const draft = drafts[resident.id] || {
      unitId: '',
      householdRole: 'integrante' as const,
    };

    return (
      <article
        key={resident.id}
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        {!isEditing ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {resident.full_name}
                </p>
                <p className="mt-1 break-all text-sm text-slate-500">
                  {resident.email || 'Sin correo registrado'}
                </p>
                {resident.phone && (
                  <p className="mt-1 text-sm text-slate-500">
                    Teléfono: {resident.phone}
                  </p>
                )}
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  resident.is_active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {resident.is_active ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            {resident.is_active && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-medium text-slate-600">
                  {resident.household_role === 'titular'
                    ? 'Titular del hogar'
                    : 'Integrante del hogar'}
                </span>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(resident)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Editar datos
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deactivate(resident)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busy ? 'Procesando...' : 'Desactivar'}
                  </button>
                </div>
              </div>
            )}

            {!resident.is_active && (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  Cuenta anterior. Reactívala solamente si corresponde a la
                  misma persona.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-600">
                    {housing.singular} para el reingreso
                    <select
                      value={draft.unitId}
                      onChange={(event) =>
                        setDrafts((old) => ({
                          ...old,
                          [resident.id]: {
                            ...draft,
                            unitId: event.target.value,
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Seleccionar {housing.article}</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unitLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-medium text-slate-600">
                    Rol en el hogar
                    <select
                      value={draft.householdRole}
                      onChange={(event) =>
                        setDrafts((old) => ({
                          ...old,
                          [resident.id]: {
                            ...draft,
                            householdRole: event.target.value as
                              | 'titular'
                              | 'integrante',
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="titular">Titular</option>
                      <option value="integrante">Integrante</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(resident)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Editar datos
                  </button>

                  <button
                    type="button"
                    disabled={busy || !draft.unitId}
                    onClick={() => void reentry(resident)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? 'Procesando...' : 'Confirmar reingreso'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="font-semibold text-slate-900">
              Editar datos personales
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">
                Nombre completo
                <input
                  required
                  maxLength={120}
                  value={editDraft.nombre}
                  onChange={(event) =>
                    setEditDraft((old) => ({
                      ...old,
                      nombre: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="text-xs font-medium text-slate-600">
                Correo electrónico
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={editDraft.email}
                  onChange={(event) =>
                    setEditDraft((old) => ({
                      ...old,
                      email: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="text-xs font-medium text-slate-600">
                Teléfono
                <input
                  maxLength={30}
                  value={editDraft.phone}
                  onChange={(event) =>
                    setEditDraft((old) => ({
                      ...old,
                      phone: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveEdit(resident)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Guardando...' : 'Guardar cambios'}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingId('')}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gestión de hogares
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Administración de titulares, integrantes y ocupación de las viviendas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            setError('');
            setMessage('');
          }}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {showForm ? 'Cancelar' : '+ Invitar residente'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Cuentas residentes</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {residents.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Activos</p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {activeCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Titulares activos</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {titularCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Inactivos</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {inactiveCount}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {showForm && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 font-semibold text-slate-900">
            Invitar nuevo ocupante
          </h2>

          <p className="mb-4 text-sm text-slate-500">
            Crea una cuenta individual para la persona que ocupará la vivienda.
            Se enviará un correo para configurar su contraseña.
          </p>

          <form onSubmit={invite} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Nombre completo
              <input
                required
                maxLength={120}
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Correo electrónico
              <input
                required
                type="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Teléfono
              <input
                maxLength={30}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              {housing.singular}
              <select
                required
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="">Seleccionar {housing.article}</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unitLabel(unit)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Rol en el hogar
              <select
                value={householdRole}
                onChange={(event) =>
                  setHouseholdRole(
                    event.target.value as 'titular' | 'integrante'
                  )
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="titular">Titular del hogar</option>
                <option value="integrante">Integrante del hogar</option>
              </select>
            </label>

            <div className="md:col-span-2">
              <button
                disabled={saving}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Enviando invitación...' : 'Enviar invitación y asignar'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Buscar nombre, correo, teléfono o ${housing.singular.toLowerCase()}...`}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="todos">Todos los residentes</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>

          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            Actualizar
          </button>
        </div>

        {loading ? (
          <p className="p-10 text-center text-sm text-slate-500">
            Cargando hogares...
          </p>
        ) : filteredResidents.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No hay residentes para mostrar.
          </p>
        ) : (
          <div className="space-y-4 bg-slate-50 p-3 md:p-4">
            {occupiedHouses.map(({ unit, residents: houseResidents }) => {
              const homeLabel = unitLabel(unit);
              const titular = houseResidents.find(
                (resident) => resident.household_role === 'titular'
              );
              const integrantes = houseResidents.filter(
                (resident) => resident.household_role === 'integrante'
              );

              return (
                <section
                  key={unit.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {homeLabel}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {houseResidents.length} de 5 cuentas residentes activas
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busyUnit === unit.id}
                      onClick={() =>
                        void closeHousehold(unit, houseResidents)
                      }
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busyUnit === unit.id
                        ? 'Finalizando...'
                        : 'Finalizar ocupación'}
                    </button>
                  </div>

                  <div className="space-y-4 p-4">
                    {titular && visibleIds.has(titular.id) && (
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                          Titular del hogar
                        </p>
                        {residentCard(titular)}
                      </div>
                    )}

                    {integrantes.some((resident) =>
                      visibleIds.has(resident.id)
                    ) && (
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                          Integrantes del hogar
                        </p>
                        <div className="space-y-3">
                          {integrantes
                            .filter((resident) => visibleIds.has(resident.id))
                            .map(residentCard)}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            {activeWithoutHouse.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-white p-4">
                <h2 className="font-semibold text-slate-900">
                  Cuentas activas sin vivienda asignada
                </h2>
                <div className="mt-3 space-y-3">
                  {activeWithoutHouse.map(residentCard)}
                </div>
              </section>
            )}

            {visibleInactive.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Cuentas inactivas
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Historial de antiguos ocupantes. El reingreso debe
                    corresponder a la misma persona, no a un nuevo ocupante.
                  </p>
                </div>

                <div className="mt-3 space-y-3">
                  {visibleInactive.map(residentCard)}
                </div>
              </section>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="flex w-full items-center justify-between p-4 text-left font-semibold text-slate-800"
        >
          Historial de hogares ({history.length})
          <span className="text-sm text-slate-500">
            {showHistory ? 'Ocultar' : 'Consultar'}
          </span>
        </button>

        {showHistory && (
          <div className="overflow-x-auto border-t border-slate-100">
            {history.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">
                Todavía no hay movimientos registrados.
              </p>
            ) : (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Residente</th>
                    <th className="p-3">{housing.singular}</th>
                    <th className="p-3">Rol</th>
                    <th className="p-3">Desde</th>
                    <th className="p-3">Hasta</th>
                    <th className="p-3">Motivo</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        {residents.find(
                          (resident) => resident.id === item.user_id
                        )?.full_name || 'Cuenta histórica'}
                      </td>

                      <td className="p-3">
                        {unitLabel(unitMap.get(item.unit_id))}
                      </td>

                      <td className="p-3">
                        {item.household_role === 'titular'
                          ? 'Titular'
                          : 'Integrante'}
                      </td>

                      <td className="p-3">
                        {new Date(item.started_at).toLocaleDateString('es-CO')}
                      </td>

                      <td className="p-3">
                        {item.ended_at
                          ? new Date(item.ended_at).toLocaleDateString('es-CO')
                          : 'Actual'}
                      </td>

                      <td className="p-3">
                        {item.end_reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
