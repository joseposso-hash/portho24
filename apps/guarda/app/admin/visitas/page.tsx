'use client';

import { useEffect, useState } from 'react';
import EvidenceImage from '../../components/EvidenceImage';
import { supabase } from '../../lib/supabase';
import { formatUnitLabel } from '../../lib/tenant-config';

export default function AdminVisitas() {
  const [visitas, setVisitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [housingModel, setHousingModel] = useState('units');
  const [error, setError] = useState('');

  useEffect(() => {
    setFechaFiltro(new Date().toLocaleDateString('en-CA'));
  }, []);

  useEffect(() => {
    if (fechaFiltro) void cargar();
  }, [fechaFiltro]);

  async function cargar() {
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setVisitas([]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.tenant_id) {
        setVisitas([]);
        return;
      }

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('housing_model')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (tenantError) throw tenantError;
      setHousingModel(tenant?.housing_model ?? profile.tenant_id);

      const inicio = `${fechaFiltro}T00:00:00`;
      const fin = `${fechaFiltro}T23:59:59`;
      const { data, error: queryError } = await supabase
        .from('visits')
        .select('id, tenant_id, photo_url, status, created_at, check_in_at, visitors(full_name, doc_number), units(code, towers(name))')
        .eq('tenant_id', profile.tenant_id)
        .gte('created_at', inicio)
        .lte('created_at', fin)
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      setVisitas(data || []);
    } catch (err: any) {
      setError(err?.message || 'No fue posible cargar las visitas.');
      setVisitas([]);
    } finally {
      setLoading(false);
    }
  }

  const termino = busqueda.trim().toLowerCase();
  const filtrados = visitas.filter((v) => {
    const unidad = v.units as any;
    const destino = formatUnitLabel(
      String(unidad?.code || ''),
      unidad?.towers?.name,
      housingModel
    ).toLowerCase();
    return !termino ||
      v.visitors?.full_name?.toLowerCase().includes(termino) ||
      v.visitors?.doc_number?.toLowerCase().includes(termino) ||
      destino.includes(termino);
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
        <h1 className="text-xl font-bold text-slate-800">Historial de Visitas</h1>
      </header>

      <main className="mx-auto max-w-6xl p-8">
        <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
          <input
            type="text"
            placeholder="Buscar visitante, documento o vivienda..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none md:w-1/2"
          />
          <div className="relative w-full md:w-auto">
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4">Foto</th>
                <th className="px-6 py-4">Visitante</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Visita a</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay visitas registradas en esta fecha.</td></tr>
              ) : filtrados.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    {v.photo_url ? (
                      <EvidenceImage src={v.photo_url} alt="Visitante" className="h-10 w-10 rounded-full object-cover shadow-sm" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] text-slate-400">N/A</div>
                    )}
                  </td>
                  <td className="px-6 py-3 font-semibold text-slate-900">{v.visitors?.full_name || 'Sin nombre'}</td>
                  <td className="px-6 py-3 text-slate-600">{v.visitors?.doc_number || '-'}</td>
                  <td className="px-6 py-3 text-xs font-semibold text-[#1E3A5F]">
                    {formatUnitLabel(String((v.units as any)?.code || ''), (v.units as any)?.towers?.name, housingModel)}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                      v.status === 'checked_in' ? 'bg-blue-100 text-blue-800' :
                      v.status === 'authorized' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {v.status === 'checked_in' ? 'Adentro' : v.status === 'authorized' ? 'Esperando' : 'Finalizada'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-600">
                    {v.check_in_at ? new Date(v.check_in_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'No ingresó'}
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
