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
  is_active: boolean;
};

const emptyForm = {
  name: '',
  description: '',
  capacity: '',
  icon: '',
  requires_approval: true,
  is_active: true,
};

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
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(profile.tenant_id);

    const { data, error } = await supabase
      .from('areas_comunes')
      .select('id,name,description,capacity,requires_approval,icon,is_active')
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

    if (form.capacity && (!Number.isFinite(Number(form.capacity)) || Number(form.capacity) < 1)) {
      setMessage('Ingresa una capacidad válida.');
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
      is_active: form.is_active,
    };

    const result = editingId
      ? await supabase.from('areas_comunes')
          .update(payload)
          .eq('id', editingId)
          .eq('tenant_id', tenantId)
      : await supabase.from('areas_comunes')
          .insert({ ...payload, tenant_id: tenantId });

    if (result.error) {
      setMessage(result.error.message);
    } else {
      setMessage(editingId ? 'Área actualizada.' : 'Área creada.');
      reset();
      await load();
    }

    setSaving(false);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-10 flex h-16 items-center border-b border-slate-200 bg-white px-5 md:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Portho24 · Administración</p>
          <h1 className="text-lg font-bold text-slate-800">Áreas comunes</h1>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-5 md:grid-cols-[minmax(0,1fr)_420px] md:p-8">
        <section className="space-y-3">
          <h2 className="font-bold text-slate-800">Áreas registradas</h2>

          {loading ? (
            <p className="text-sm text-slate-500">Cargando...</p>
          ) : areas.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Todavía no hay áreas comunes.
            </p>
          ) : areas.map(area => (
            <article key={area.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {area.icon ? area.icon + ' ' : ''}{area.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {area.description || 'Sin descripción'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {area.capacity ? `Capacidad: ${area.capacity}` : 'Capacidad no especificada'}
                    {' · '}
                    {area.requires_approval ? 'Requiere aprobación' : 'Sin aprobación previa'}
                    {' · '}
                    {area.is_active ? 'Activa' : 'Inactiva'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => edit(area)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Editar
                </button>
              </div>
            </article>
          ))}
        </section>

        <section className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">
              {editingId ? 'Editar área' : 'Nueva área'}
            </h2>
            {editingId && (
              <button type="button" onClick={reset} className="text-sm text-slate-500 underline">
                Cancelar
              </button>
            )}
          </div>

          <form onSubmit={save} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Nombre
              <input
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Descripción
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Capacidad
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={e => setForm({ ...form, capacity: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Icono
                <input
                  value={form.icon}
                  onChange={e => setForm({ ...form, icon: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.requires_approval}
                onChange={e => setForm({ ...form, requires_approval: e.target.checked })}
              />
              Requiere aprobación
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
              />
              Área activa para nuevas reservas
            </label>

            {message && <p className="text-sm text-slate-600">{message}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#1E3A5F] px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear área'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
