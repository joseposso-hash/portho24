'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatUnitLabel, type HousingModel } from '../../lib/tenant-config';
import EvidenceImage from '../../components/EvidenceImage';

export default function AdminPaquetes() {
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [housingModel, setHousingModel] = useState<HousingModel>('units');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, [fechaFiltro]);

  async function cargar() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error('No hay una sesión activa.');

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id, role, is_active')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      if (!profile || profile.is_active !== true || profile.role !== 'admin') {
        throw new Error('No tienes autorización para consultar este historial.');
      }
      if (!profile.tenant_id) throw new Error('El usuario no tiene un conjunto asignado.');

      const tenantId = profile.tenant_id;

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('housing_model')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantError && !['42703', 'PGRST204'].includes(tenantError.code)) {
        throw tenantError;
      }

      const model = (tenant?.housing_model || 'units') as HousingModel;

      setHousingModel(model);

      // El historial se limita al tenant autenticado desde la consulta.
      let query = supabase
        .from('packages')
        .select('id, tenant_id, courier, tracking_number, photo_url, status, created_at, picked_up_at, units(code, tower_id, towers(name))')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fechaFiltro) {
        const inicio = new Date(`${fechaFiltro}T00:00:00`);
        const fin = new Date(`${fechaFiltro}T23:59:59.999`);
        query = query
          .gte('created_at', inicio.toISOString())
          .lte('created_at', fin.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      setPaquetes(data || []);
    } catch (error) {
      console.error('Error al cargar historial de paquetes:', error);
      setPaquetes([]);
      setErrorMsg(error instanceof Error ? error.message : 'No fue posible cargar el historial.');
    } finally {
      setLoading(false);
    }
  }

  const filtrados = paquetes.filter((p) => {
    const term = busqueda.trim().toLowerCase();
    if (!term) return true;

    const destination = formatUnitLabel(
      p.units?.code,
      p.units?.towers?.name,
      housingModel
    ).toLowerCase();

    return (
      p.courier?.toLowerCase().includes(term) ||
      p.tracking_number?.toLowerCase().includes(term) ||
      destination.includes(term)
    );
  });

  function destinationLabel(p: any) {
    if (!p.units) return 'Vivienda no disponible';
    return formatUnitLabel(
      p.units.code,
      p.units.towers?.name,
      housingModel
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
        <h1 className="text-xl font-bold text-slate-800">Historial de Paquetería</h1>
      </header>

      <div className="mx-auto max-w-6xl p-8">
        <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
          <input
            type="text"
            placeholder="Buscar por mensajería, guía o destino..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none md:w-1/2"
          />

          <div className="flex w-full items-center gap-2 md:w-auto">
            <span className="whitespace-nowrap text-sm font-medium text-slate-700">Filtrar fecha:</span>
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none md:w-auto"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-4">Foto</th>
                  <th className="px-4 py-4">Mensajería / Guía</th>
                  <th className="px-4 py-4">Destino</th>
                  <th className="px-4 py-4">Recibido</th>
                  <th className="px-4 py-4">Entregado</th>
                  <th className="px-4 py-4">Estado</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center">Cargando...</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay paquetes registrados.</td></tr>
                ) : (
                  filtrados.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <EvidenceImage src={p.photo_url} alt="Paquete" className="h-10 w-10 rounded-lg object-cover" />
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {p.courier}
                        <br />
                        <span className="text-xs font-normal text-slate-500">
                          {p.tracking_number || 'Sin número de guía'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">
                        {destinationLabel(p)}
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-600">
                        {new Date(p.created_at).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-600">
                        {p.picked_up_at
                          ? new Date(p.picked_up_at).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                          p.status === 'received' ? 'bg-amber-100 text-amber-800' :
                          p.status === 'notified' ? 'bg-blue-100 text-blue-800' :
                          p.status === 'picked_up' ? 'bg-emerald-100 text-emerald-800' :
                          p.status === 'returned' ? 'bg-slate-100 text-slate-700' :
                          p.status === 'expired' ? 'bg-red-100 text-red-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {p.status === 'received' ? 'Recibido' :
                           p.status === 'notified' ? 'Notificado' :
                           p.status === 'picked_up' ? 'Entregado' :
                           p.status === 'returned' ? 'Devuelto' :
                           p.status === 'expired' ? 'Vencido' :
                           'Estado desconocido'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
