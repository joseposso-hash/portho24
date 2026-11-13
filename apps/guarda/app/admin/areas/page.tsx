'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Area = {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  requires_approval: boolean;
  icon: string | null;
  reservation_fee: number;
  currency: string;
  allow_prepaid: boolean;
  allow_account_charge: boolean;
  payment_methods: string[];
  is_active: boolean;
};

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

const methods = [
  { id: 'transfer', label: 'Transferencia' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'other', label: 'Otro' },
];

export default function AdminAreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle();
    if (!profile?.tenant_id) { setLoading(false); return; }
    setTenantId(profile.tenant_id);
    const { data, error } = await supabase
      .from('areas_comunes')
      .select('id,name,description,capacity,requires_approval,icon,reservation_fee,currency,allow_prepaid,allow_account_charge,payment_methods,is_active')
      .eq('tenant_id', profile.tenant_id)
      .order('name');
    if (error) setMessage(error.message);
    else setAreas((data || []) as Area[]);
    setLoading(false);
  }

  function edit(area: Area) {
    setEditingId(area.id);
    setForm({
      name: area.name || '',
      description: area.description || '',
      capacity: area.capacity?.toString() || '',
      icon: area.icon || '',
      requires_approval: area.requires_approval,
      reservation_fee: String(area.reservation_fee ?? 0),
      currency: area.currency || 'COP',
      allow_prepaid: area.allow_prepaid,
      allow_account_charge: area.allow_account_charge,
      payment_methods: area.payment_methods || ['transfer'],
      is_active: area.is_active,
    });
    setMessage('');
  }

  function reset() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage('');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const fee = Number(form.reservation_fee);
    if (!Number.isFinite(fee) || fee < 0) {
      setMessage('Ingresa una tarifa válida.');
      return;
    }
    if (fee > 0 && !form.allow_prepaid && !form.allow_account_charge) {
      setMessage('Activa al menos una modalidad de cobro.');
      return;
    }
    if ((form.allow_prepaid || form.allow_account_charge) && form.payment_methods.length === 0) {
      setMessage('Selecciona al menos un medio de pago para recibir los abonos.');
      return;
    }

    setSaving(true);
    setMessage('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      icon: form.icon.trim() || null,
      requires_approval: form.requires_approval,
      reservation_fee: fee,
      currency: form.currency,
      allow_prepaid: form.allow_prepaid,
      allow_account_charge: form.allow_account_charge,
      payment_methods: form.payment_methods,
      is_active: form.is_active,
    };

    const result = editingId
      ? await supabase.from('areas_comunes').update(payload).eq('id', editingId).eq('tenant_id', tenantId)
      : await supabase.from('areas_comunes').insert({ ...payload, tenant_id: tenantId });

    if (result.error) setMessage(result.error.message);
    else {
      setMessage(editingId ? 'Área actualizada.' : 'Área creada.');
      reset();
      await load();
    }
    setSaving(false);
  }

  function toggleMethod(method: string) {
    setForm(current => ({
      ...current,
      payment_methods: current.payment_methods.includes(method)
        ? current.payment_methods.filter(value => value !== method)
        : [...current.payment_methods, method],
    }));
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-10 flex h-16 items-center border-b border-slate-200 bg-white px-5 md:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Portho24 · Administración</p>
          <h1 className="text-lg font-bold text-slate-800">Áreas comunes y tarifas</h1>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-5 md:grid-cols-[minmax(0,1fr)_420px] md:p-8">
        <section className="space-y-3">
          <h2 className="font-bold text-slate-800">Áreas registradas</h2>
          {loading ? <p className="text-sm text-slate-500">Cargando...</p> : areas.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Todavía no hay áreas comunes.</p>
          ) : areas.map(area => (
            <article key={area.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{area.icon ? area.icon + ' ' : ''}{area.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{area.description || 'Sin descripción'}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {area.reservation_fee === 0 ? 'Sin costo' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: area.currency || 'COP', maximumFractionDigits: 0 }).format(area.reservation_fee)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {area.allow_prepaid ? 'Pago anticipado' : ''}{area.allow_prepaid && area.allow_account_charge ? ' · ' : ''}{area.allow_account_charge ? 'Cargo a cuenta' : ''}
                    {!area.allow_prepaid && !area.allow_account_charge ? 'Cobros deshabilitados' : ''}
                    {' · '}{area.is_active ? 'Activa' : 'Inactiva'}
                  </p>
                </div>
                <button onClick={() => edit(area)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Editar</button>
              </div>
            </article>
          ))}
        </section>

        <section className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">{editingId ? 'Editar área' : 'Nueva área'}</h2>
            {editingId && <button onClick={reset} className="text-sm text-slate-500 underline">Cancelar</button>}
          </div>
          <form onSubmit={save} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Nombre
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Descripción
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">Capacidad
                <input type="number" min="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Icono
                <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.requires_approval} onChange={e => setForm({ ...form, requires_approval: e.target.checked })} /> Requiere aprobación
            </label>
            <div className="border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-sm font-bold text-slate-800">Configuración de cobro</h3>
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <label className="block text-sm font-medium text-slate-700">Tarifa por reserva
                  <input type="number" min="0" step="100" value={form.reservation_fee} onChange={e => setForm({ ...form, reservation_fee: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Moneda
                  <input value={form.currency} maxLength={3} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 uppercase" />
                </label>
              </div>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.allow_prepaid} onChange={e => setForm({ ...form, allow_prepaid: e.target.checked })} /> Permitir pago anticipado
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.allow_account_charge} onChange={e => setForm({ ...form, allow_account_charge: e.target.checked })} /> Permitir cargo a cuenta de la casa
                </label>
              </div>
              <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Medios de pago aceptados</p>
              <div className="grid grid-cols-2 gap-2">
                {methods.map(method => (
                  <label key={method.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.payment_methods.includes(method.id)} onChange={() => toggleMethod(method.id)} /> {method.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Área activa para nuevas reservas
            </label>
            {message && <p className="text-sm text-slate-600">{message}</p>}
            <button disabled={saving} className="w-full rounded-lg bg-[#1E3A5F] px-4 py-3 font-semibold text-white disabled:opacity-50">
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear área'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
