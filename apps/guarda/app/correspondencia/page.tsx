'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { formatUnitLabel, getHousingConfig, type HousingModel } from '../lib/tenant-config';

const DOCUMENT_TYPES = [
  { value: 'electricity', label: 'Energía' },
  { value: 'water', label: 'Agua' },
  { value: 'gas', label: 'Gas' },
  { value: 'telecommunications', label: 'Telefonía / Internet' },
  { value: 'television', label: 'Televisión' },
  { value: 'other', label: 'Otro documento' },
];

type Unit = { id: string; code: string; tower_id: string; tower_name?: string };
type Item = {
  id: string;
  unit_id: string;
  document_type: string;
  period: string | null;
  observations: string | null;
  status: string;
  received_at: string;
  delivered_at: string | null;
  delivered_to: string | null;
};

type Tab = 'recibir' | 'entregar' | 'historial';

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function dateKeyInBogota(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}

export default function CorrespondenciaPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('recibir');
  const [tenantId, setTenantId] = useState('');
  const [userId, setUserId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [housingModel, setHousingModel] = useState<HousingModel>('houses');
  const housing = getHousingConfig(housingModel);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [receivingUnitId, setReceivingUnitId] = useState('');
  const [documents, setDocuments] = useState<string[]>([]);
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);

  const [deliveryUnitId, setDeliveryUnitId] = useState('');
  const [pending, setPending] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [searched, setSearched] = useState(false);
  const [delivering, setDelivering] = useState(false);

  const [history, setHistory] = useState<Item[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyDate, setHistoryDate] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);

  const [period, setPeriod] = useState('');

  useEffect(() => {
    const now = new Date();
    setPeriod(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setHistoryDate(dateKeyInBogota(now.toISOString()));
  }, []);

  const receivingUnit = units.find((unit) => unit.id === receivingUnitId);
  const deliveryUnit = units.find((unit) => unit.id === deliveryUnitId);

  function documentLabel(type: string) {
    return DOCUMENT_TYPES.find((d) => d.value === type)?.label || type;
  }

  function formatPeriod(value: string | null) {
    if (!value) return 'Sin período';
    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return value;
    return new Date(year, month - 1, 15).toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
    });
  }

  function houseLabel(unitId: string) {
    const unit = units.find((u) => u.id === unitId);
    return unit ? formatUnitLabel(unit.code, unit.tower_name, housingModel) : 'Vivienda no identificada';
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
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
          .single();

        if (profileError) throw profileError;
        if (!profile?.is_active || profile.role !== 'guard' || !profile.tenant_id) {
          throw new Error('Esta pantalla está disponible únicamente para vigilancia activa.');
        }

        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('housing_model')
          .eq('id', profile.tenant_id)
          .maybeSingle();

        if (tenantError && !['42703', 'PGRST204'].includes(tenantError.code)) {
          throw tenantError;
        }

        const model = (tenant?.housing_model || 'houses') as HousingModel;

        const { data: towers, error: towerError } = await supabase
          .from('towers')
          .select('id, name')
          .eq('tenant_id', profile.tenant_id);

        if (towerError) throw towerError;

        const towerIds = (towers || []).map((tower) => tower.id);
        if (!towerIds.length) throw new Error('No hay torres registradas.');

        const towerNames = new Map(
          (towers || []).map((tower) => [tower.id, tower.name || ''])
        );

        const { data: unitRows, error: unitError } = await supabase
          .from('units')
          .select('id, code, tower_id')
          .in('tower_id', towerIds)
          .order('code');

        if (unitError) throw unitError;
        if (cancelled) return;

        setTenantId(profile.tenant_id);
        setUserId(user.id);
        setHousingModel(model);
        setUnits((unitRows || []).map((unit: any) => ({
          ...unit,
          tower_name: towerNames.get(unit.tower_id) || '',
        })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No fue posible cargar el módulo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [router]);

  async function receiveDocuments(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!receivingUnit) {
      setError(`Selecciona ${housing.article} válido.`);
      return;
    }
    if (!documents.length) {
      setError('Selecciona al menos un documento.');
      return;
    }

    setSaving(true);
    try {
      // Los documentos tipo "other" pueden recibirse varias veces
      // para una misma casa y período.
      const documentsToValidate = documents.filter(
        (type) => type !== 'other'
      );

      if (documentsToValidate.length > 0) {
        const { data: existing, error: duplicateError } = await supabase
          .from('correspondence_items')
          .select('document_type')
          .eq('tenant_id', tenantId)
          .eq('unit_id', receivingUnit.id)
          .eq('period', period)
          .neq('status', 'cancelled')
          .in('document_type', documentsToValidate);

        if (duplicateError) throw duplicateError;

        if (existing?.length) {
          const names = existing
            .map((item) => documentLabel(item.document_type))
            .join(', ');
          throw new Error(`Ya están registrados para esta vivienda y período: ${names}.`);
        }
      }
      const records = documents.map((type) => ({
        tenant_id: tenantId,
        unit_id: receivingUnit.id,
        document_type: type,
        period,
        observations: observations.trim() || null,
        status: 'pending',
        received_by: userId,
        received_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('correspondence_items')
        .insert(records);

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('Uno de esos documentos ya fue registrado para esta vivienda y período.');
        }
        throw insertError;
      }

      setMessage(`${documents.length} documento(s) recibido(s) para ${formatUnitLabel(receivingUnit.code, receivingUnit.tower_name, housingModel)}.`);
      setReceivingUnitId('');
      setDocuments([]);
      setObservations('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible registrar los documentos.');
    } finally {
      setSaving(false);
    }
  }

  async function searchPending() {
    setError('');
    setMessage('');
    setPending([]);
    setSelected([]);
    setRecipient('');
    setDeliveryNotes('');
    setSearched(false);

    if (!deliveryUnit) {
      setError('Escribe un número de casa válido.');
      return;
    }

    setSaving(true);
    try {
      const { data, error: queryError } = await supabase
        .from('correspondence_items')
        .select('id, unit_id, document_type, period, observations, status, received_at, delivered_at, delivered_to')
        .eq('tenant_id', tenantId)
        .eq('unit_id', deliveryUnit.id)
        .in('status', ['pending', 'pickup_requested'])
        .order('received_at', { ascending: true });

      if (queryError) throw queryError;
      setPending((data || []) as Item[]);
      setSearched(true);

      if (!data?.length) setMessage('Esta vivienda no tiene documentos pendientes de entrega.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible consultar los pendientes.');
    } finally {
      setSaving(false);
    }
  }

  async function deliverDocuments(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!deliveryUnit || !recipient.trim() || !selected.length) {
      setError('Selecciona documentos e indica quién los recibe.');
      return;
    }

    const selectedItems = pending.filter((item) => selected.includes(item.id));
    if (selectedItems.length !== selected.length) {
      setError('La selección cambió. Consulta nuevamente los pendientes.');
      return;
    }

    setDelivering(true);
    const deliveredAt = new Date().toISOString();

    try {
      const { data: updated, error: updateError } = await supabase
        .from('correspondence_items')
        .update({
          status: 'delivered',
          delivered_by: userId,
          delivered_to: recipient.trim(),
          delivered_at: deliveredAt,
        })
        .eq('tenant_id', tenantId)
        .eq('unit_id', deliveryUnit.id)
        .in('id', selected)
        .in('status', ['pending', 'pickup_requested'])
        .select('id');

      if (updateError) throw updateError;

      const updatedIds = (updated || []).map((item) => item.id);
      if (updatedIds.length !== selected.length) {
        throw new Error('No se actualizaron todos los documentos. Consulta nuevamente antes de repetir la entrega.');
      }

      const events = selectedItems.map((item) => ({
        tenant_id: tenantId,
        unit_id: deliveryUnit.id,
        item_id: item.id,
        event_type: 'delivered',
        performed_by: userId,
        recipient_name: recipient.trim(),
        notes: deliveryNotes.trim() || null,
      }));

      const { error: eventError } = await supabase
        .from('correspondence_events')
        .insert(events);

      if (eventError) {
        console.error('Error registrando eventos de entrega:', eventError);
        throw new Error('Los documentos cambiaron de estado, pero no se pudo registrar el historial de entrega. Revisa el historial antes de repetir la operación.');
      }

      setMessage(`${updatedIds.length} documento(s) entregado(s) a ${recipient.trim()} en ${formatUnitLabel(deliveryUnit.code, deliveryUnit.tower_name, housingModel)}.`);
      setPending((current) => current.filter((item) => !updatedIds.includes(item.id)));
      setSelected([]);
      setRecipient('');
      setDeliveryNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible confirmar la entrega.');
    } finally {
      setDelivering(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('correspondence_items')
        .select('id, unit_id, document_type, period, observations, status, received_at, delivered_at, delivered_to')
        .eq('tenant_id', tenantId)
        .order('received_at', { ascending: false })
        .limit(500);

      if (queryError) throw queryError;
      setHistory((data || []) as Item[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar el historial.');
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'historial' && tenantId) loadHistory();
  }, [tab, tenantId]);

  const filteredHistory = history.filter((item) => {
    const matchesStatus = historyFilter === 'all' || item.status === historyFilter;
    const matchesHouse = houseLabel(item.unit_id).toLowerCase().includes(historySearch.toLowerCase().trim());
    return matchesStatus && matchesHouse;
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'recibir', label: 'Recibir' },
    { id: 'entregar', label: 'Entregar' },
    { id: 'historial', label: 'Historial' },
  ];

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Cargando correspondencia...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Correspondencia</h1>
            <p className="text-sm text-slate-500">Recepción y entrega de documentos en portería</p>
          </div>
          <button onClick={() => router.push('/')} className="rounded-lg bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
            Volver
          </button>
        </header>

        <nav className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-sm">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setError(''); setMessage(''); }}
              className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${
                tab === item.id ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

        {tab === 'recibir' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-1 text-lg font-bold text-slate-900">Recibir documentos</h2>
            <p className="mb-5 text-sm text-slate-500">Registra las facturas y documentos que llegan para cada vivienda.</p>

            <form onSubmit={receiveDocuments} className="space-y-5">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{housing.singular} de destino</span>
                <select
                  value={receivingUnitId}
                  onChange={(e) => setReceivingUnitId(e.target.value)}
                  
                  className={inputClass}
                  required
                >
                  <option value="">Seleccionar {housing.article}</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {formatUnitLabel(unit.code, unit.tower_name, housingModel)}
                    </option>
                  ))}
                </select>
                {receivingUnitId && (
                  <span className="mt-1 block text-xs text-emerald-700">
                    {formatUnitLabel(receivingUnit?.code, receivingUnit?.tower_name, housingModel)} verificada
                  </span>
                )}
              </label>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Documentos recibidos</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DOCUMENT_TYPES.map((doc) => (
                    <label key={doc.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${
                      documents.includes(doc.value) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'
                    }`}>
                      <input
                        type="checkbox"
                        checked={documents.includes(doc.value)}
                        onChange={(e) => setDocuments((current) =>
                          e.target.checked ? [...current, doc.value] : current.filter((v) => v !== doc.value)
                        )}
                      />
                      {doc.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                Período de recepción: <strong className="capitalize">{formatPeriod(period)}</strong> (automático)
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Observaciones (opcional)</span>
                <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} maxLength={500} className={inputClass} />
              </label>

              <button disabled={saving || !receivingUnit || !documents.length} className="w-full rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
                {saving ? 'Registrando...' : `Registrar ${documents.length || ''} documento(s)`}
              </button>
            </form>
          </section>
        )}

        {tab === 'entregar' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-1 text-lg font-bold text-slate-900">Entregar documentos</h2>
            <p className="mb-5 text-sm text-slate-500">Consulta la vivienda, selecciona lo que se entrega y registra quién recibe.</p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="text-sm font-semibold text-slate-700">{housing.singular} de destino</span>
                <select value={deliveryUnitId} onChange={(e) => {
                  setDeliveryUnitId(e.target.value);
                  setPending([]);
                  setSelected([]);
                  setSearched(false);
                }} className={inputClass}>
                  <option value="">Seleccionar {housing.article}</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {formatUnitLabel(unit.code, unit.tower_name, housingModel)}
                    </option>
                  ))}
                </select>
                {deliveryUnitId && <span className="mt-1 block text-xs text-emerald-700">{formatUnitLabel(deliveryUnit?.code, deliveryUnit?.tower_name, housingModel)} verificada</span>}
              </label>
              <button onClick={searchPending} disabled={saving || !deliveryUnit} className="rounded-lg bg-[#1E3A5F] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Consultando...' : 'Consultar pendientes'}
              </button>
            </div>

            {searched && pending.length > 0 && (
              <form onSubmit={deliverDocuments} className="mt-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">Documentos pendientes</h3>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{pending.length} pendiente(s)</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {pending.map((item) => (
                    <label key={item.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                      selected.includes(item.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'
                    }`}>
                      <input type="checkbox" checked={selected.includes(item.id)} onChange={(e) =>
                        setSelected((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))
                      } />
                      <span>
                        <strong className="block text-sm text-slate-800">{documentLabel(item.document_type)}</strong>
                        <span className="block text-xs capitalize text-slate-500">{formatPeriod(item.period)}</span>
                        <span className="block text-xs text-slate-500">Recibido: {new Date(item.received_at).toLocaleDateString('es-CO')}</span>
                        {item.observations && <span className="mt-1 block text-xs text-slate-500">{item.observations}</span>}
                      </span>
                    </label>
                  ))}
                </div>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Nombre de quien recibe</span>
                  <input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={120} placeholder="Nombre completo" className={inputClass} required />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Observaciones de entrega (opcional)</span>
                  <input value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} maxLength={500} className={inputClass} />
                </label>

                <button disabled={delivering || !selected.length || !recipient.trim()} className="w-full rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {delivering ? 'Confirmando...' : `Confirmar entrega (${selected.length})`}
                </button>
              </form>
            )}

            {searched && pending.length === 0 && (
              <div className="mt-6 rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">No hay documentos pendientes para esta vivienda.</div>
            )}
          </section>
        )}

        {tab === 'historial' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-900">Historial de correspondencia</h2>
              <p className="text-sm text-slate-500">Consulta los documentos recibidos y su estado de entrega.</p>
            </div>

                        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Fecha de recepción</span>
                <input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  className={inputClass}
                />
              </label>

              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar por vivienda o documento"
                className={inputClass}
              />

              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="pickup_requested">Solicitados</option>
                <option value="delivered">Entregados</option>
                <option value="returned">Devueltos</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {historyDate ? `Mostrando registros del ${historyDate}` : 'Mostrando todos los días'}
              </p>
              <button
                type="button"
                onClick={() => setHistoryDate('')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ver todos los días
              </button>
            </div>

            {historyLoading ? <p className="py-8 text-center text-sm text-slate-500">Cargando historial...</p> : (
              <div className="space-y-2">
                {filteredHistory.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{documentLabel(item.document_type)} · {houseLabel(item.unit_id)}</p>
                        <p className="text-xs capitalize text-slate-500">{formatPeriod(item.period)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        item.status === 'pending' || item.status === 'pickup_requested' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>{item.status === 'pickup_requested' ? 'Solicitado' : item.status === 'delivered' ? 'Entregado' : item.status === 'pending' ? 'Pendiente' : item.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Recibido: {new Date(item.received_at).toLocaleString('es-CO')}</p>
                    {item.delivered_at && <p className="text-xs text-emerald-700">Entregado: {new Date(item.delivered_at).toLocaleString('es-CO')} · Recibió: {item.delivered_to || 'No especificado'}</p>}
                    {item.observations && <p className="mt-1 text-xs text-slate-500">{item.observations}</p>}
                  </article>
                ))}
                {!filteredHistory.length && <p className="py-8 text-center text-sm text-slate-500">No hay registros que coincidan con la búsqueda.</p>}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

