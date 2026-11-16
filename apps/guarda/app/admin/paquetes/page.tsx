'use client';

import { useEffect, useState } from 'react';
import EvidenceImage from '../../components/EvidenceImage';
import { supabase } from '../../lib/supabase';
import { formatUnitLabel } from '../../lib/tenant-config';

export default function AdminPaquetes() {
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [housingModel, setHousingModel] = useState('units');
  const [error, setError] = useState('');

  useEffect(() => {
    void cargar();
  }, [fechaFiltro]);

  async function cargar() {
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPaquetes([]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.tenant_id) {
        setPaquetes([]);
        return;
      }

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('housing_model')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (tenantError) throw tenantError;
      setHousingModel(tenant?.housing_model ?? profile.tenant_id);

      let query = supabase
        .from('packages')
        .select('id, tenant_id, courier, tracking_number, photo_url, status, created_at, picked_up_at, units(code, towers(name))')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fechaFiltro) {
        query = query
          .gte('created_at', `${fechaFiltro}T00:00:00`)
          .lte('created_at', `${fechaFiltro}T23:59:59`);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setPaquetes(data || []);
    } catch (err: any) {
      setError(err?.message || 'No fue posible cargar los paquetes.');
      setPaquetes([]);
    } finally {
      setLoading(false);
    }
  }

  const termino = busqueda.trim().toLowerCase();
  const filtrados = paquetes.filter((p) => {
    const unidad = p.units as any;
    const destino = formatUnitLabel(
      String(unidad?.code || ''),
      unidad?.towers?.name,
      housingModel
    ).toLowerCase();

    return !termino ||
      p.courier?.toLowerCase().includes(termino) ||
      p.tracking_number?.toLowerCase().includes(termino) ||
      destino.includes(termino);
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
        <h1 className="text-xl font-bold text-slate-800">Historial de Paquetería</h1>
      </header>

      <main className="mx-auto max-w-6xl p-8">
        <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
          <input
            type="text"
            placeholder="Buscar por destino, transportadora o guía..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none md:w-1/2"
          />
          <div className="flex w-full items-center gap-2 md:w-auto">
            <label htmlFor="fecha-paquetes" className="whitespace-nowrap text-sm font-medium text-slate-700">Filtrar fecha:</label>
            <input
              id="fecha-paquetes"
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 md:w-auto"
            />
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-4">Foto</th>
                <th className="px-4 py-4">Transportadora / Guía</th>
                <th className="px-4 py-4">Destino</th>
                <th className="px-4 py-4">Recibido</th>
                <th className="px-4 py-4">Entregado</th>
                <th className="px-4 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay paquetes registrados.</td></tr>
              ) : filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <EvidenceImage src={p.photo_url} alt="Paquete" className="h-10 w-10 rounded-lg object-cover" />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {p.courier || 'Sin transportadora'}
                    <br />
                    <span className="text-xs font-normal text-slate-500">{p.tracking_number || 'Sin guía'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">
                    {formatUnitLabel(String((p.units as any)?.code || ''), (p.units as any)?.towers?.name, housingModel)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(p.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.picked_up_at ? new Date(p.picked_up_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
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
                       p.status === 'expired' ? 'Vencido' : 'Estado desconocido'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
