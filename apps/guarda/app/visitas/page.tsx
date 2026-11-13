'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { uploadEvidence } from '../lib/evidencias-client';
import { formatUnitLabel, HousingModel } from '../lib/tenant-config';

const PINAR_ID = '4888dce4-b74a-491f-b7d6-f2d903f2fe30';

export default function VisitasPage() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [housingModel, setHousingModel] = useState<HousingModel>('units');
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [vieneEnVehiculo, setVieneEnVehiculo] = useState(false);
  const [fotoVisitante, setFotoVisitante] = useState<File | null>(null);

  useEffect(() => {
    async function init() {
      setLoadingUnits(true);

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('No hay una sesión autenticada.');

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('tenant_id, is_active')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile?.tenant_id || profile.is_active === false) {
          throw new Error('El usuario no tiene un conjunto activo asignado.');
        }

        const currentTenantId = profile.tenant_id;
        setTenantId(currentTenantId);

        let model: HousingModel =
          currentTenantId === PINAR_ID ? 'houses' : 'units';

        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('housing_model')
          .eq('id', currentTenantId)
          .maybeSingle();

        if (!tenantError && tenant?.housing_model) {
          model = tenant.housing_model as HousingModel;
        }

        setHousingModel(model);

        const { data: towers, error: towersError } = await supabase
          .from('towers')
          .select('id, name')
          .eq('tenant_id', currentTenantId)
          .order('name');

        if (towersError) throw towersError;

        const towerIds = (towers || []).map((tower: any) => tower.id);
        const towerNames = new Map(
          (towers || []).map((tower: any) => [tower.id, tower.name])
        );

        if (towerIds.length === 0) {
          setUnits([]);
          return;
        }

        const { data: unitData, error: unitsError } = await supabase
          .from('units')
          .select('id, code, tower_id')
          .in('tower_id', towerIds)
          .order('code');

        if (unitsError) throw unitsError;

        setUnits(
          (unitData || []).map((unit: any) => ({
            ...unit,
            towerName: towerNames.get(unit.tower_id) || ''
          }))
        );
      } catch (error: any) {
        setErrorMsg(error.message || 'No fue posible cargar las viviendas.');
      } finally {
        setLoadingUnits(false);
      }
    }

    init();
  }, []);

  function seleccionarUnidad(value: string) {
    setUnitSearch(value);

    const normalized = value.trim().toLowerCase();
    const found = units.find((unit) => {
      const code = String(unit.code || '').toLowerCase();
      const label = formatUnitLabel(
        unit.code,
        unit.towerName,
        housingModel
      ).toLowerCase();

      return code === normalized || label === normalized;
    });

    setUnitId(found?.id || '');
  }

  async function registrarVisita(e: React.FormEvent) {
    e.preventDefault();

    if (!nombre.trim() || !documento.trim() || !unitId || !tenantId) {
      setErrorMsg('Completa los datos y selecciona una vivienda válida.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('La sesión ha expirado.');

      const { data: visitor, error: visitorError } = await supabase
        .from('visitors')
        .insert({
          tenant_id: tenantId,
          full_name: nombre.trim(),
          doc_number: documento.trim()
        })
        .select()
        .single();

      if (visitorError) throw visitorError;

      let photoUrl: string | null = null;

      if (fotoVisitante) {
        photoUrl = await uploadEvidence(fotoVisitante, 'visitante');
      }

      const { data: visita, error: visitError } = await supabase
        .from('visits')
        .insert({
          tenant_id: tenantId,
          visitor_id: visitor.id,
          host_user_id: user.id,
          unit_id: unitId,
          status: 'checked_in',
          check_in_at: new Date().toISOString(),
          photo_url: photoUrl
        })
        .select()
        .single();

      if (visitError) throw visitError;

      if (vieneEnVehiculo) {
        router.push(
          `/parking?visit_id=${visita.id}&nombre=${encodeURIComponent(nombre)}&doc=${encodeURIComponent(documento)}&casa=${encodeURIComponent(unitSearch)}`
        );
      } else {
        setSuccess(true);
      }
    } catch (error: any) {
      setErrorMsg(error.message || 'Error al registrar la visita.');
    } finally {
      setLoading(false);
    }
  }

  const housingLabel = housingModel === 'houses'
    ? 'Casa'
    : housingModel === 'apartments'
      ? 'Torre / Apartamento'
      : 'Vivienda';

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-lg mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Visita No Anunciada</h1>
        <button
          onClick={() => router.push('/')}
          className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50"
        >
          Volver
        </button>
      </header>

      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        {!success ? (
          <form onSubmit={registrarVisita} className="space-y-5">
            {errorMsg && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Nombre del visitante</span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Documento de identidad</span>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                required
              />
            </label>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <p className="text-sm font-bold text-slate-800">Destino de la visita</p>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{housingLabel}</span>
                <input
                  type="text"
                  list="housing-options"
                  value={unitSearch}
                  onChange={(e) => seleccionarUnidad(e.target.value)}
                  placeholder={
                    loadingUnits
                      ? 'Cargando viviendas...'
                      : housingModel === 'apartments'
                        ? 'Ej. Torre 1 · Apartamento 101'
                        : housingModel === 'houses'
                          ? 'Escribe el número de casa'
                          : 'Escribe la vivienda'
                  }
                  disabled={loadingUnits}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900 disabled:bg-slate-100"
                  required
                />
                <datalist id="housing-options">
                  {units.map((unit) => (
                    <option
                      key={unit.id}
                      value={formatUnitLabel(unit.code, unit.towerName, housingModel)}
                    />
                  ))}
                </datalist>
                {unitSearch && !unitId && (
                  <span className="mt-1 block text-xs text-amber-700">
                    Selecciona una vivienda válida de la lista.
                  </span>
                )}
              </label>
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Foto del visitante</span>
              <label className="flex h-16 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 transition hover:border-[#1E3A5F]">
                <span className="text-xs font-medium text-slate-600">
                  {fotoVisitante ? 'Foto capturada' : 'Tomar foto del visitante'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(e) => setFotoVisitante(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={vieneEnVehiculo}
                  onChange={(e) => setVieneEnVehiculo(e.target.checked)}
                  className="h-4 w-4 rounded text-[#1E3A5F]"
                />
                <span className="text-sm font-bold text-amber-800">
                  El visitante viene en vehículo
                </span>
              </label>
              <p className="mt-2 text-xs text-amber-700">
                Al guardar, podrás continuar con el registro del vehículo.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || loadingUnits || !unitId}
              className="mt-2 w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50"
            >
              {loading ? 'Registrando ingreso...' : 'Dar ingreso al visitante'}
            </button>
          </form>
        ) : (
          <div className="space-y-6 py-8 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Ingreso registrado</h2>
            <button
              onClick={() => {
                setSuccess(false);
                setNombre('');
                setDocumento('');
                setUnitId('');
                setUnitSearch('');
                setVieneEnVehiculo(false);
                setFotoVisitante(null);
              }}
              className="mt-4 rounded-xl bg-[#1E3A5F] px-6 py-3 font-semibold text-white hover:bg-[#152945]"
            >
              Registrar otra visita
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
