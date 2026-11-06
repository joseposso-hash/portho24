
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

const TENANT_ID = '4888dce4-b74a-491f-b7d6-f2d903f2fe30';

type Residente = {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
};

type Vivienda = {
  id: string;
  code: string;
  has_parking: boolean | null;
  residentes: Residente[];
};

export default function AdminDirectorio() {
  const [viviendas, setViviendas] = useState<Vivienda[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargarDirectorio() {
      setLoading(true);
      setError('');

      try {
        // Obtener la torre técnica que agrupa las viviendas de Pinar.
        const { data: torre, error: errorTorre } = await supabase
          .from('towers')
          .select('id')
          .eq('tenant_id', TENANT_ID)
          .maybeSingle();

        if (errorTorre) throw errorTorre;

        if (!torre) {
          throw new Error('No se encontró la agrupación de viviendas de Pinar.');
        }

        // Cargar las viviendas.
        const { data: unidades, error: errorUnidades } = await supabase
          .from('units')
          .select('id, code, has_parking')
          .eq('tower_id', torre.id);

        if (errorUnidades) throw errorUnidades;

        // Cargar los residentes de Pinar.
        const { data: residentes, error: errorResidentes } = await supabase
          .from('users')
          .select('id, full_name, email, unit_id, is_active')
          .eq('tenant_id', TENANT_ID)
          .eq('role', 'resident')
          .eq('is_active', true);

        if (errorResidentes) throw errorResidentes;

        // Relacionar cada residente con su vivienda.
        const resultado: Vivienda[] = (unidades || [])
          .map((unidad) => ({
            id: unidad.id,
            code: unidad.code,
            has_parking: unidad.has_parking,
            residentes: (residentes || [])
              .filter((residente) => residente.unit_id === unidad.id)
              .map((residente) => ({
                id: residente.id,
                full_name: residente.full_name,
                email: residente.email,
                is_active: residente.is_active,
              })),
          }))
          .sort((a, b) => Number(a.code) - Number(b.code));

        setViviendas(resultado);
      } catch (err: any) {
        console.error('Error cargando directorio:', err);
        setError(err.message || 'No fue posible cargar el directorio.');
      } finally {
        setLoading(false);
      }
    }

    cargarDirectorio();
  }, []);

  const viviendasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return viviendas.filter((vivienda) => {
      const coincideBusqueda =
        vivienda.code.toLowerCase().includes(texto) ||
        vivienda.residentes.some(
          (r) =>
            r.full_name.toLowerCase().includes(texto) ||
            (r.email || '').toLowerCase().includes(texto)
        );

      const coincideFiltro =
        filtro === 'todas' ||
        (filtro === 'asignadas' && vivienda.residentes.length > 0) ||
        (filtro === 'disponibles' && vivienda.residentes.length === 0);

      return coincideBusqueda && coincideFiltro;
    });
  }, [viviendas, busqueda, filtro]);

  const totalAsignadas = viviendas.filter(
    (v) => v.residentes.length > 0
  ).length;

  const totalDisponibles = viviendas.length - totalAsignadas;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-5 md:px-8 py-5">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Administración / Pinar E3
          </p>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">
            Directorio de viviendas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registro individual de las casas del conjunto.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-5 md:p-8">
        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Total de viviendas</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">
              {loading ? '—' : viviendas.length}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Con residente activo</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">
              {loading ? '—' : totalAsignadas}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Sin residente activo</p>
            <p className="text-3xl font-bold text-amber-600 mt-1">
              {loading ? '—' : totalDisponibles}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
          <div className="flex flex-col md:flex-row gap-3 justify-between">
            <input
              type="text"
              placeholder="Buscar casa, residente o correo..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full md:max-w-md rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500"
            />

            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700"
            >
              <option value="todas">Todas las viviendas</option>
              <option value="asignadas">Con residente</option>
              <option value="disponibles">Sin residente</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">
              Casas registradas
            </h2>
            <span className="text-xs text-slate-500">
              {viviendasFiltradas.length} resultados
            </span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400">
              Cargando viviendas...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-slate-400">
              No se pudo cargar el directorio.
            </div>
          ) : viviendasFiltradas.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              No se encontraron viviendas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Casa</th>
                    <th className="px-5 py-3">Residente</th>
                    <th className="px-5 py-3">Correo</th>
                    <th className="px-5 py-3">Parqueadero</th>
                    <th className="px-5 py-3">Estado</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {viviendasFiltradas.map((vivienda) => (
                    <tr key={vivienda.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-bold text-slate-800">
                        Casa {vivienda.code}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {vivienda.residentes.length > 0
                          ? vivienda.residentes.map((r) => (
                              <div key={r.id}>{r.full_name}</div>
                            ))
                          : '—'}
                      </td>

                      <td className="px-5 py-4 text-slate-500">
                        {vivienda.residentes.length > 0
                          ? vivienda.residentes.map((r) => (
                              <div key={r.id}>{r.email || '—'}</div>
                            ))
                          : '—'}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {vivienda.has_parking ? 'Sí' : 'No'}
                      </td>

                      <td className="px-5 py-4">
                        {vivienda.residentes.length > 0 ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                            Asignada
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                            Disponible
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
