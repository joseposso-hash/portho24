'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import EvidenceImage from '../../components/EvidenceImage';
import { formatUnitLabel, HousingModel } from '../../lib/tenant-config';

const PINAR_ID = '4888dce4-b74a-491f-b7d6-f2d903f2fe30';

export default function AdminVisitas() {
  const [visitas, setVisitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [housingModel, setHousingModel] = useState<HousingModel>('units');
  const [error, setError] = useState('');

  useEffect(() => {
    const today = new Date();
    const localDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    setFechaFiltro(localDate);
  }, []);

  useEffect(() => {
    if (!fechaFiltro) return;

    let mounted = true;

    async function cargar() {
      setLoading(true);
      setError('');

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('No hay una sesión autenticada.');

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('tenant_id, role, is_active')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile?.tenant_id || profile.role !== 'admin' || profile.is_active === false) {
          throw new Error('No tienes permisos para consultar este historial.');
        }

        const tenantId = profile.tenant_id;

        let model: HousingModel = tenantId === PINAR_ID ? 'houses' : 'units';

        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('housing_model')
          .eq('id', tenantId)
          .maybeSingle();

        if (!tenantError && tenant?.housing_model) {
          model = tenant.housing_model as HousingModel;
        }

        const start = new Date(`${fechaFiltro}T00:00:00`).toISOString();
        const end = new Date(`${fechaFiltro}T23:59:59.999`).toISOString();

        const { data, error: visitsError } = await supabase
          .from('visits')
          .select('*, visitors(full_name, doc_number), units(code, towers(name))')
          .eq('tenant_id', tenantId)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: false });

        if (visitsError) throw visitsError;

        if (mounted) {
          setHousingModel(model);
          setVisitas(data || []);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'No fue posible cargar las visitas.');
          setVisitas([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    cargar();

    return () => {
      mounted = false;
    };
  }, [fechaFiltro]);

  const filtrados = visitas.filter((visit) => {
    const name = (visit.visitors as any)?.full_name?.toLowerCase() || '';
    const document = (visit.visitors as any)?.doc_number || '';
    const search = busqueda.toLowerCase();

    return name.includes(search) || document.includes(busqueda);
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
        <h1 className="text-xl font-bold text-slate-800">Historial de visitas</h1>
      </header>

      <div className="mx-auto max-w-6xl p-8">
        <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
          <input
            type="text"
            placeholder="Buscar por nombre o documento..."
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
            <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] font-bold text-slate-500">
              FECHA
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4">Foto</th>
                <th className="px-6 py-4">Visitante</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Destino</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center">Cargando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No hay visitas registradas en esta fecha.
                  </td>
                </tr>
              ) : (
                filtrados.map((visit) => (
                  <tr key={visit.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      {visit.photo_url ? (
                        <EvidenceImage
                          src={visit.photo_url}
                          alt="Visitante"
                          className="h-10 w-10 rounded-full object-cover shadow-sm"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] text-slate-400">
                          N/A
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      {(visit.visitors as any)?.full_name}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {(visit.visitors as any)?.doc_number}
                    </td>
                    <td className="px-6 py-3 text-xs font-semibold text-[#1E3A5F]">
                      {formatUnitLabel(
                        (visit.units as any)?.code,
                        (visit.units as any)?.towers?.name,
                        housingModel
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        visit.status === 'checked_in'
                          ? 'bg-blue-100 text-blue-800'
                          : visit.status === 'authorized'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {visit.status === 'checked_in'
                          ? 'Adentro'
                          : visit.status === 'authorized'
                            ? 'Esperando'
                            : 'Salió'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600">
                      {visit.check_in_at
                        ? new Date(visit.check_in_at).toLocaleTimeString('es-CO')
                        : 'No ingresó'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
