
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getHousingConfig, formatUnitLabel, type HousingModel } from '../../lib/tenant-config';

const DOCUMENT_TYPES: Record<string, string> = {
  electricity: 'EnergÃ­a',
  water: 'Agua',
  gas: 'Gas',
  telecommunications: 'TelefonÃ­a / Internet',
  television: 'TelevisiÃ³n',
  other: 'Otro documento',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  pickup_requested: 'Retiro solicitado',
  delivered: 'Entregado',
  returned: 'Devuelto',
  cancelled: 'Cancelado',
};

const EVENT_LABELS: Record<string, string> = {
  received: 'Recibido en porterÃ­a',
  pickup_requested: 'Retiro solicitado',
  delivered: 'Entregado al residente',
  returned: 'Devuelto',
  cancelled: 'Cancelado',
  updated: 'Actualizado',
};

export default function AdminCorrespondencia() {
  const [items, setItems] = useState<any[]>([]);
  const [eventos, setEventos] = useState<any[]>([]);
  const [seleccionado, setSeleccionado] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [error, setError] = useState('');
  const [housingModel, setHousingModel] = useState<HousingModel>('houses');

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setItems([]);
        setError('No se encontró una sesión activa.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError || !profile?.tenant_id) {
        setItems([]);
        setError('No fue posible identificar el conjunto del usuario.');
        return;
      }

      const tenantId = profile.tenant_id;
      let model: HousingModel = 'houses';

      const { data: tenantWithModel, error: tenantModelError } = await supabase
        .from('tenants')
        .select('housing_model')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantModelError && !['42703', 'PGRST204'].includes(tenantModelError.code)) throw tenantModelError;
      if (!tenantModelError && tenantWithModel?.housing_model) {
        model = tenantWithModel.housing_model as HousingModel;
      }
      setHousingModel(model);

      // Se obtienen exclusivamente las viviendas pertenecientes al tenant.
      const { data: towers, error: towersError } = await supabase
        .from('towers')
        .select('id')
        .eq('tenant_id', tenantId);

      if (towersError) throw towersError;

      const towerIds = (towers || []).map((tower: any) => tower.id);

      if (towerIds.length === 0) {
        setItems([]);
        return;
      }

      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id')
        .in('tower_id', towerIds);

      if (unitsError) throw unitsError;

      const unitIds = (units || []).map((unit: any) => unit.id);

      if (unitIds.length === 0) {
        setItems([]);
        return;
      }

      const { data, error: itemsError } = await supabase
        .from('correspondence_items')
        .select('id, unit_id, document_type, provider, period, observations, status, received_at, requested_at, delivered_at, delivered_to, units(code, towers(name))')
        .in('unit_id', unitIds)
        .order('received_at', { ascending: false })
        .limit(300);

      if (itemsError) throw itemsError;

      setItems(data || []);
    } catch (err: any) {
      console.error('Error cargando correspondencia:', err);
      setError(err?.message || 'No fue posible cargar la correspondencia.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function verEventos(item: any) {
    setSeleccionado(item);
    setEventos([]);

    const { data, error } = await supabase
      .from('correspondence_events')
      .select('id, event_type, recipient_name, notes, created_at')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false });

    if (error) {
      setError(`No fue posible cargar el historial: ${error.message}`);
      return;
    }

    setEventos(data || []);
  }

  const filtrados = items.filter((item) => {
    const texto = busqueda.trim().toLowerCase();
    const documento = nombreDocumento(item.document_type).toLowerCase();

    const coincideTexto =
      !texto ||
      item.provider?.toLowerCase().includes(texto) ||
      item.document_type?.toLowerCase().includes(texto) ||
      documento.includes(texto) ||
      item.period?.toLowerCase().includes(texto) ||
      item.units?.code?.toLowerCase().includes(texto) ||
      String(item.units?.code || '').toLowerCase().includes(texto) ||
      item.units?.towers?.name?.toLowerCase().includes(texto) ||
      formatUnitLabel(item.units?.code, item.units?.towers?.name, housingModel).toLowerCase().includes(texto);

    const coincideEstado =
      estadoFiltro === 'todos' || item.status === estadoFiltro;

    const coincideFecha =
      !fechaFiltro || item.received_at?.slice(0, 10) === fechaFiltro;

    return coincideTexto && coincideEstado && coincideFecha;
  });

  const pendientes = items.filter((item) =>
    ['pending', 'pickup_requested'].includes(item.status)
  ).length;

  const solicitados = items.filter(
    (item) => item.status === 'pickup_requested'
  ).length;

  const entregados = items.filter(
    (item) => item.status === 'delivered'
  ).length;

  function nombreDocumento(tipo: string) {
    return DOCUMENT_TYPES[tipo] || tipo || 'Documento';
  }

  function estadoTexto(status: string) {
    return STATUS_LABELS[status] || status || 'Sin estado';
  }

  function eventoTexto(tipo: string) {
    return EVENT_LABELS[tipo] || estadoTexto(tipo);
  }

  function fecha(valor: string | null) {
    if (!valor) return '-';

    return new Date(valor).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function estiloEstado(status: string) {
    const estilos: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800',
      pickup_requested: 'bg-blue-100 text-blue-800',
      delivered: 'bg-emerald-100 text-emerald-800',
      returned: 'bg-slate-200 text-slate-700',
      cancelled: 'bg-red-100 text-red-800',
    };

    return estilos[status] || 'bg-slate-100 text-slate-700';
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <h1 className="text-xl font-bold text-slate-800">
          Correspondencia y Facturas
        </h1>

        <button
          type="button"
          onClick={cargar}
          disabled={loading}
          className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </header>

      <div className="mx-auto max-w-7xl p-5 md:p-8">
        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-500">Pendientes</p>
            <p className="text-3xl font-bold text-amber-600">{pendientes}</p>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-500">Retiros solicitados</p>
            <p className="text-3xl font-bold text-blue-600">{solicitados}</p>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-500">Entregados</p>
            <p className="text-3xl font-bold text-emerald-600">{entregados}</p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              placeholder="Buscar vivienda, proveedor o documento..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm text-slate-900"
            />

            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm text-slate-900"
            >
              <option value="todos">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="pickup_requested">Retiro solicitado</option>
              <option value="delivered">Entregados</option>
              <option value="returned">Devueltos</option>
              <option value="cancelled">Cancelados</option>
            </select>

            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex justify-between border-b p-4">
            <h2 className="font-bold text-slate-800">
              Registro de correspondencia
            </h2>

            <span className="text-sm text-slate-500">
              {filtrados.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-4">{getHousingConfig(housingModel).singular}</th>
                  <th className="p-4">Documento</th>
                  <th className="p-4">Proveedor</th>
                  <th className="p-4">PerÃ­odo</th>
                  <th className="p-4">RecepciÃ³n</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Detalle</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Cargando registros...
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No hay correspondencia registrada.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-4 font-semibold text-[#1E3A5F]">
                        {formatUnitLabel(item.units?.code, item.units?.towers?.name, housingModel)}
                      </td>

                      <td className="p-4">
                        {nombreDocumento(item.document_type)}
                      </td>

                      <td className="p-4">{item.provider || '-'}</td>
                      <td className="p-4">{item.period || '-'}</td>

                      <td className="p-4 text-xs">
                        {fecha(item.received_at)}
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${estiloEstado(item.status)}`}
                        >
                          {estadoTexto(item.status)}
                        </span>
                      </td>

                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => verEventos(item)}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          Ver historial
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {seleccionado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b p-5">
                <h2 className="text-lg font-bold">Detalle del documento</h2>

                <button
                  type="button"
                  onClick={() => {
                    setSeleccionado(null);
                    setEventos([]);
                  }}
                  className="text-xl text-slate-500 hover:text-slate-800"
                  aria-label="Cerrar detalle"
                >
                  âœ•
                </button>
              </div>

              <div className="space-y-3 p-5 text-sm">
                <p>
                  <strong>{getHousingConfig(housingModel).singular}:</strong>{' '}
                  {formatUnitLabel(seleccionado.units?.code, seleccionado.units?.towers?.name, housingModel)}
                </p>

                <p>
                  <strong>Documento:</strong>{' '}
                  {nombreDocumento(seleccionado.document_type)}
                </p>

                <p>
                  <strong>Proveedor:</strong> {seleccionado.provider || '-'}
                </p>

                <p>
                  <strong>PerÃ­odo:</strong> {seleccionado.period || '-'}
                </p>

                <p>
                  <strong>Estado:</strong> {estadoTexto(seleccionado.status)}
                </p>

                <p>
                  <strong>Recibido:</strong> {fecha(seleccionado.received_at)}
                </p>

                <p>
                  <strong>Solicitud de retiro:</strong>{' '}
                  {fecha(seleccionado.requested_at)}
                </p>

                <p>
                  <strong>Entregado:</strong> {fecha(seleccionado.delivered_at)}
                </p>

                <p>
                  <strong>Recibido por:</strong> {seleccionado.delivered_to || '-'}
                </p>

                <p>
                  <strong>Observaciones:</strong>{' '}
                  {seleccionado.observations || '-'}
                </p>

                <hr className="border-slate-200" />

                <h3 className="font-bold text-slate-800">Historial de movimientos</h3>

                {eventos.length === 0 ? (
                  <p className="text-slate-400">
                    No hay movimientos registrados.
                  </p>
                ) : (
                  eventos.map((evento) => (
                    <div
                      key={evento.id}
                      className="border-l-2 border-blue-300 py-2 pl-3"
                    >
                      <p className="font-semibold">
                        {eventoTexto(evento.event_type)}
                      </p>

                      <p className="text-xs text-slate-500">
                        {fecha(evento.created_at)}
                      </p>

                      {evento.recipient_name && (
                        <p>Receptor: {evento.recipient_name}</p>
                      )}

                      {evento.notes && <p>{evento.notes}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

