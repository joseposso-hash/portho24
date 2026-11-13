'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getHousingConfig, HousingModel } from '../../lib/tenant-config';

type Residente = {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
};

type Vivienda = {
  id: string;
  code: string;
  towerName: string;
  has_parking: boolean | null;
  residentes: Residente[];
};

export default function AdminDirectorio() {
  const [viviendas, setViviendas] = useState<Vivienda[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nombreConjunto, setNombreConjunto] = useState('Mi Conjunto');
  const [housingModel, setHousingModel] = useState<HousingModel>('units');

  useEffect(() => {
    let mounted = true;

    async function cargarDirectorio() {
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
        if (!profile?.tenant_id) {
          throw new Error('El usuario no tiene un conjunto asignado.');
        }
        if (profile.role !== 'admin' || profile.is_active === false) {
          throw new Error('No tienes permisos para consultar este directorio.');
        }

        const tenantId = profile.tenant_id;

        let tenant: any = null;

        const { data: tenantWithModel, error: modelError } = await supabase
          .from('tenants')
          .select('name, housing_model')
          .eq('id', tenantId)
          .maybeSingle();

        if (modelError) {
          const { data, error } = await supabase
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .maybeSingle();

          if (error) throw error;
          tenant = data;
        } else {
          tenant = tenantWithModel;
        }

        const model = (
          tenant?.housing_model ||
          (tenantId === '4888dce4-b74a-491f-b7d6-f2d903f2fe30' ? 'houses' : 'units')
        ) as HousingModel;

        const { data: torres, error: towersError } = await supabase
          .from('towers')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .order('name');

        if (towersError) throw towersError;

        const towerIds = (torres || []).map((tower) => tower.id);
        let unidades: any[] = [];

        if (towerIds.length > 0) {
          const { data, error: unitsError } = await supabase
            .from('units')
            .select('id, code, has_parking, tower_id')
            .in('tower_id', towerIds);

          if (unitsError) throw unitsError;
          unidades = data || [];
        }

        const { data: residentes, error: residentsError } = await supabase
          .from('users')
          .select('id, full_name, email, unit_id, is_active')
          .eq('tenant_id', tenantId)
          .eq('role', 'resident')
          .eq('is_active', true);

        if (residentsError) throw residentsError;

        const towerNames = new Map(
          (torres || []).map((tower) => [tower.id, tower.name])
        );

        const resultado: Vivienda[] = unidades
          .map((unidad) => ({
            id: unidad.id,
            code: unidad.code,
            towerName: towerNames.get(unidad.tower_id) || '',
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
          .sort((a, b) => {
            const towerCompare = a.towerName.localeCompare(b.towerName, 'es');
            if (towerCompare !== 0) return towerCompare;
            return a.code.localeCompare(b.code, 'es', { numeric: true });
          });

        if (!mounted) return;

        setNombreConjunto(tenant?.name || 'Mi Conjunto');
        setHousingModel(model);
        setViviendas(resultado);
      } catch (err: any) {
        console.error('Error cargando directorio:', err);
        if (mounted) {
          setError(err.message || 'No fue posible cargar el directorio.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    cargarDirectorio();

    return () => {
      mounted = false;
    };
  }, []);

  const config = getHousingConfig(housingModel);

  const viviendasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return viviendas.filter((vivienda) => {
      const coincideBusqueda =
        vivienda.code.toLowerCase().includes(texto) ||
        vivienda.towerName.toLowerCase().includes(texto) ||
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
      <header className="border-b border-slate-200 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Administración / {nombreConjunto}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">
            Directorio de {config.plural.toLowerCase()}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Registro de {config.plural.toLowerCase()} y residentes del conjunto.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-5 md:p-8">
        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Total de {config.plural.toLowerCase()}</p>
            <p className="mt-1 text-3xl font-bold text-slate-800">
              {loading ? '—' : viviendas.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Con residente activo</p>
            <p className="mt-1 text-3xl font-bold text-emerald-600">
              {loading ? '—' : totalAsignadas}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Sin residente activo</p>
            <p className="mt-1 text-3xl font-bold text-amber-600">
              {loading ? '—' : totalDisponibles}
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row">
            <input
              type="text"
              placeholder={`Buscar ${config.article}, torre, residente o correo...`}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 md:max-w-md"
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

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-800">
              {config.plural} registradas
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
                    <th className="px-5 py-3">Torre</th>
                    <th className="px-5 py-3">{config.singular}</th>
                    <th className="px-5 py-3">Residente</th>
                    <th className="px-5 py-3">Correo</th>
                    <th className="px-5 py-3">Parqueadero</th>
                    <th className="px-5 py-3">Estado</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {viviendasFiltradas.map((vivienda) => (
                    <tr key={vivienda.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-slate-600">
                        {housingModel === 'houses' ? '—' : vivienda.towerName || '—'}
                      </td>

                      <td className="px-5 py-4 font-bold text-slate-800">
                        {config.singular} {vivienda.code}
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

