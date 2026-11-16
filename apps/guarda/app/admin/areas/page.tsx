'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

type Area = {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  requires_approval: boolean;
  icon: string | null;
  reservation_fee: number | string | null;
  currency: string | null;
  allow_prepaid: boolean;
  allow_account_charge: boolean;
  payment_methods: string[] | null;
  is_active: boolean;
};

const methods = [
  { id: 'transfer', label: 'Transferencia' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'other', label: 'Otro medio' },
];

const emptyForm = {
  name: '',
  description: '',
  capacity: '',
  icon: '',
  requires_approval: true,
  reservation_fee: '0',
  currency: 'COP',
  allow_prepaid: false,
  allow_account_charge: false,
  payment_methods: ['transfer'] as string[],
  is_active: true,
};

const money = (amount: number | string | null, currency?: string | null) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency || 'COP',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

export default function AdminAreasPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id, role, is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile || profile.role !== 'admin' || profile.is_active !== true || !profile.tenant_id) {
        router.replace(
          profile?.role === 'resident' ? '/residente' :
          profile?.role === 'guard' ? '/guarda' : '/login'
        );
        return;
      }

      setTenantId(profile.tenant_id);
      setAuthorized(true);

      const { data, error } = await supabase
        .from('areas_comunes')
        .select('id,name,description,capacity,requires_approval,icon,reservation_fee,currency,allow_prepaid,allow_account_charge,payment_methods,is_active')
        .eq('tenant_id', profile.tenant_id)
        .order('name');

      if (error) throw error;
      setAreas((data || []) as Area[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar las áreas comunes.');
      setMessageError(true);
    } finally {
      setLoading(false);
    }
  }

  function edit(area: Area) {
    setEditingId(area.id);
    setForm({
      name: area.name || '',
      description: area.description || '',
      capacity: area.capacity?.toString() || '',
      icon: area.icon || '',
      requires_approval: area.requires_approval ?? true,
      reservation_fee: String(area.reservation_fee ?? 0),
      currency: area.currency || 'COP',
      allow_prepaid: area.allow_prepaid ?? false,
      allow_account_charge: area.allow_account_charge ?? false,
      payment_methods: area.payment_methods?.length ? area.payment_methods : ['transfer'],
      is_active: area.is_active ?? true,
    });
    setMessage('');
    setMessageError(false);
  }

  function reset() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage('');
    setMessageError(false);
  }

  function toggleMethod(method: string) {
    setForm(current => ({
      ...current,
      payment_methods: current.payment_methods.includes(method)
        ? current.payment_methods.filter(value => value !== method)
        : [...current.payment_methods, method],
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !authorized || saving) return;

    const name = form.name.trim();
    const fee = Number(form.reservation_fee);
    const capacity = form.capacity ? Number(form.capacity) : null;

    if (!name) {
      setMessage('Ingresa el nombre del área.');
      setMessageError(true);
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      setMessage('Ingresa una tarifa válida, igual o superior a cero.');
      setMessageError(true);
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
      setMessage('La moneda debe ser un código de tres letras, por ejemplo COP.');
      setMessageError(true);
      return;
    }
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      setMessage('La capacidad debe ser un número entero mayor que cero.');
      setMessageError(true);
      return;
    }
    if (fee > 0 && !form.allow_prepaid && !form.allow_account_charge) {
      setMessage('Activa al menos una modalidad para gestionar el cobro.');
      setMessageError(true);
      return;
    }
    if ((form.allow_prepaid || form.allow_account_charge) && form.payment_methods.length === 0) {
      setMessage('Selecciona al menos un medio de pago.');
      setMessageError(true);
      return;
    }

    setSaving(true);
    setMessage('');
    setMessageError(false);

    const payload = {
      name,
      description: form.description.trim() || null,
      capacity,
      icon: form.icon.trim() || null,
      requires_approval: form.requires_approval,
      reservation_fee: fee,
      currency: form.currency.trim().toUpperCase() || 'COP',
      allow_prepaid: form.allow_prepaid,
      allow_account_charge: form.allow_account_charge,
      payment_methods: form.payment_methods,
      is_active: form.is_active,
    };

    try {
      const result = editingId
        ? await supabase.from('areas_comunes')
            .update(payload)
            .eq('id', editingId)
            .eq('tenant_id', tenantId)
        : await supabase.from('areas_comunes')
            .insert({ ...payload, tenant_id: tenantId });

      if (result.error) throw result.error;

      setMessage(editingId ? 'Área actualizada correctamente.' : 'Área creada correctamente.');
      setMessageError(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar el área.');
      setMessageError(true);
    } finally {
      setSaving(false);
    }
  }

  if (!authorized && loading) {
    return <div className="p-8 text-sm text-slate-500">Verificando acceso administrativo...</div>;
  }
  if (!authorized) return null;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Portho24 · Administración</p>
          <h1 className="text-lg font-bold text-slate-800">Áreas comunes y tarifas</h1>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline">
          {areas.length} {areas.length === 1 ? 'área registrada' : 'áreas registradas'}
        </span>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-5 md:grid-cols-[minmax(0,1fr)_440px] md:p-8">
        <section className="space-y-4">
          <div>
            <h2 className="font-bold text-slate-800">Espacios del conjunto</h2>
            <p className="mt-1 text-sm text-slate-500">Administra disponibilidad, capacidad, aprobación y condiciones económicas de cada espacio.</p>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Cargando áreas comunes...</div>
          ) : areas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h3 className="font-semibold text-slate-800">Aún no hay áreas registradas</h3>
              <p className="mt-1 text-sm text-slate-500">Crea la primera área para habilitar su configuración y vincularla al módulo de Reservas.</p>
            </div>
          ) : areas.map(area => (
            <article key={area.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">{area.icon ? area.icon + ' ' : ''}{area.name}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{area.description || 'Sin descripción ni condiciones registradas.'}</p>
                  <p className="mt-3 text-lg font-bold text-slate-900">
                    {Number(area.reservation_fee || 0) === 0 ? 'Sin costo' : money(area.reservation_fee, area.currency)}
                    <span className="ml-2 text-xs font-normal text-slate-500">por reserva</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                      {area.capacity ? 'Capacidad: ' + area.capacity : 'Capacidad no definida'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                      {area.requires_approval ? 'Requiere aprobación' : 'Aprobación automática'}
                    </span>
                    <span className={'rounded-full px-2.5 py-1 ' + (area.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                      {area.is_active ? 'Disponible para reservar' : 'Suspendida'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {area.allow_prepaid ? 'Pago anticipado' : ''}
                    {area.allow_prepaid && area.allow_account_charge ? ' · ' : ''}
                    {area.allow_account_charge ? 'Cargo a cuenta de la vivienda' : ''}
                    {!area.allow_prepaid && !area.allow_account_charge ? 'Sin modalidades de cobro habilitadas' : ''}
                    {' · Medios: '}
                    {(area.payment_methods || []).map(method => methods.find(item => item.id === method)?.label || method).join(', ') || 'No definidos'}
                  </p>
                </div>
                <button type="button" onClick={() => edit(area)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Editar
                </button>
              </div>
            </article>
          ))}
        </section>

        <section className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">{editingId ? 'Editar área' : 'Nueva área'}</h2>
              <p className="mt-1 text-xs text-slate-500">Los cambios se aplican únicamente al conjunto de la sesión.</p>
            </div>
            {editingId && <button type="button" onClick={reset} className="text-sm text-slate-500 underline">Cancelar</button>}
          </div>

          <form onSubmit={save} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Nombre del área
              <input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Salón social" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-slate-900" />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Descripción y condiciones de uso
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Indica horarios permitidos, reglas, requisitos o recomendaciones para los residentes." className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-slate-900" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Capacidad máxima
                <input type="number" min="1" step="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-slate-900" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Icono
                <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="Ej. 🏊" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-slate-900" />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.requires_approval} onChange={e => setForm({ ...form, requires_approval: e.target.checked })} />
              La reserva requiere aprobación administrativa
            </label>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="mb-1 text-sm font-bold text-slate-800">Configuración de cobro</h3>
              <p className="mb-3 text-xs text-slate-500">Define si el uso del espacio tiene costo y cómo se reciben los pagos.</p>
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Tarifa por reserva
                  <input type="number" min="0" step="100" value={form.reservation_fee} onChange={e => setForm({ ...form, reservation_fee: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-slate-900" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Moneda
                  <input required maxLength={3} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 uppercase text-slate-900" />
                </label>
              </div>

              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.allow_prepaid} onChange={e => setForm({ ...form, allow_prepaid: e.target.checked })} />
                  Permitir pago anticipado
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.allow_account_charge} onChange={e => setForm({ ...form, allow_account_charge: e.target.checked })} />
                  Permitir cargo a cuenta de la vivienda
                </label>
              </div>

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Medios de pago aceptados</p>
              <div className="grid grid-cols-2 gap-2">
                {methods.map(method => (
                  <label key={method.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.payment_methods.includes(method.id)} onChange={() => toggleMethod(method.id)} />
                    {method.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              Área habilitada para nuevas reservas
            </label>

            {message && (
              <p role="status" className={'rounded-lg p-3 text-sm ' + (messageError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                {message}
              </p>
            )}

            <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#1E3A5F] px-4 py-3 font-semibold text-white disabled:opacity-50">
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear área'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
