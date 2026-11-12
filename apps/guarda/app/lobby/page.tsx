
'use client';

import { getHouseNumber } from '../lib/house-number';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

import { uploadEvidence } from '../lib/evidencias-client';
const COURIERS = ['Amazon', 'DHL', 'Servientrega', 'MercadoLibre', 'FedEx', 'Otro'];

type Unit = {
  id: string;
  code: string;
  tower_id: string;
};

export default function LobbyPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState<string | null>(null);

  // Registro de paquetes
  const [courier, setCourier] = useState(COURIERS[0]);
  const [tracking, setTracking] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unitId, setUnitId] = useState('');
  const [unitSearch, setUnitSearch] = useState('');

  // Registro de correspondencia

  // Entrega de correspondencia

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setUnitsLoading(true);
      setUnitsError(null);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw new Error(`Error de sesión: ${authError.message}`);
        if (!user) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('tenant_id, role, is_active')
          .eq('id', user.id)
          .single();

        if (profileError) {
          throw new Error(`No fue posible consultar el perfil: ${profileError.message}`);
        }

        if (!profile || profile.is_active !== true) {
          throw new Error('El usuario no está activo. Contacta al administrador.');
        }

        if (profile.role !== 'guard') {
          throw new Error('Esta pantalla está disponible únicamente para vigilancia.');
        }

        if (!profile.tenant_id) {
          throw new Error('El usuario no tiene un conjunto asignado.');
        }

        const currentTenantId = profile.tenant_id;

        const { data: towers, error: towersError } = await supabase
          .from('towers')
          .select('id')
          .eq('tenant_id', currentTenantId);

        if (towersError) {
          throw new Error(`No fue posible consultar las torres: ${towersError.message}`);
        }

        if (!towers || towers.length === 0) {
          throw new Error('No se encontraron torres para este conjunto.');
        }

        const towerIds = towers.map((tower) => tower.id);

        const { data: unitRows, error: unitsQueryError } = await supabase
          .from('units')
          .select('id, code, tower_id')
          .in('tower_id', towerIds)
          .order('code');

        if (unitsQueryError) {
          throw new Error(`No fue posible cargar las casas: ${unitsQueryError.message}`);
        }

        if (cancelled) return;
        setUnits((unitRows || []) as Unit[]);

        if (!unitRows || unitRows.length === 0) {
          setUnitsError('No se encontraron casas registradas para este conjunto.');
        }
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error
          ? error.message
          : 'Error desconocido al cargar las casas.';

        setUnitsError(message);
        setUnits([]);
      } finally {
        if (!cancelled) setUnitsLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedSearch = unitSearch.trim();

  const filteredUnits = normalizedSearch
    ? units.filter((unit) =>
        getHouseNumber(unit.code).startsWith(normalizedSearch)
      )
    : units;

  const selectedUnit = units.find((unit) => unit.id === unitId);

  // Registro de paquetes
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    const validUnit = units.find((unit) => unit.id === unitId);

    if (unitsLoading) {
      setErrorMsg('Espera a que termine la carga de las casas.');
      return;
    }

    if (!validUnit) {
      setErrorMsg('Selecciona una casa válida de la lista del conjunto.');
      return;
    }

    if (!photo) {
      setErrorMsg('Por favor, sube una foto del paquete.');
      return;
    }

    setLoading(true);

    try {
      const photoUrl = await uploadEvidence(photo, 'paquete');

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error('La sesión expiró. Inicia sesión nuevamente.');
      }

      const response = await fetch('/api/paquetes/registrar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          unitId: validUnit.id,
          courier,
          tracking,
          photoUrl: photoUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'No fue posible registrar el paquete.');
      }

      setPin('registrado');
    } catch (error) {
      console.error('Error al registrar paquete:', error);
      setErrorMsg(
        error instanceof Error ? error.message : 'Error al registrar el paquete.'
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Recepción en portería
            </h1>
            <p className="text-xs text-slate-500 sm:text-sm">
              Registro de paquetes
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Volver
          </button>
        </header>

        {unitsError && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Problema al cargar las casas</p>
            <p className="mt-1">{unitsError}</p>
          </div>
        )}

        {/* Recepción: ambas tarjetas mantienen la misma altura. */}
        <div className="mx-auto max-w-3xl">

          {/* RECEPCIÓN DE PAQUETES */}
          <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex min-h-[88px] flex-col justify-center border-b border-slate-100 bg-white px-4 py-4 sm:px-5">
              <h2 className="text-lg font-bold text-slate-900">
                📦 Recibir paquete
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Registra el paquete y su destinatario.
              </p>
            </div>

            {pin ? (
              <div className="flex flex-1 flex-col items-center justify-center p-5 text-center sm:p-7">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <span className="text-2xl text-emerald-700">✓</span>
                </div>

                <h3 className="text-xl font-bold text-emerald-900">
                  ¡Paquete registrado!
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm text-emerald-700">
                  Registro confirmado. El PIN queda reservado para consulta
                  del residente; vigilancia no puede verlo.
                </p>

                <div className="mt-4 w-full rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  El PIN no se muestra al personal de vigilancia.
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPin(null);
                    setPhoto(null);
                    setTracking('');
                    setUnitId('');
                    setUnitSearch('');
                    setCourier(COURIERS[0]);
                    setErrorMsg(null);
                  }}
                  className="mt-auto w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Registrar otro paquete
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col p-4 sm:p-5">
                <div className="space-y-4">
                  {errorMsg && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                      {errorMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-700">
                        Empresa de mensajería
                      </span>
                      <select
                        value={courier}
                        onChange={(e) => setCourier(e.target.value)}
                        className={inputClass}
                      >
                        {COURIERS.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold text-slate-700">
                        Número de guía (opcional)
                      </span>
                      <input
                        type="text"
                        value={tracking}
                        onChange={(e) => setTracking(e.target.value)}
                        placeholder="Ej: AMZ-123456"
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-sm font-bold text-slate-800">
                      Destinatario
                    </p>

                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">
                        Número de casa
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={unitSearch}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 3);
                          setUnitSearch(value);

                          const matches = value && Number(value) >= 1 && Number(value) <= 460
                            ? units.filter(
                                (unit) => getHouseNumber(unit.code) === value
                              )
                            : [];

                          setUnitId(matches.length === 1 ? matches[0].id : '');
                          setErrorMsg(null);
                        }}
                        placeholder={unitsLoading ? 'Cargando casas...' : 'Ej. 24'}
                        disabled={unitsLoading || units.length === 0}
                        autoComplete="off"
                        className={inputClass}
                        required
                      />
                    </label>

                    {unitsLoading && (
                      <p className="mt-2 text-xs text-slate-500">
                        Consultando las casas del conjunto...
                      </p>
                    )}

                    {!unitsLoading &&
                      filteredUnits.length > 0 &&
                      !selectedUnit &&
                      normalizedSearch && (
                        <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                          {filteredUnits.slice(0, 30).map((unit) => (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() => {
                                setUnitId(unit.id);
                                setUnitSearch(getHouseNumber(unit.code));
                                setErrorMsg(null);
                              }}
                              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 last:border-b-0 hover:bg-slate-100"
                            >
                              Casa {getHouseNumber(unit.code)}
                            </button>
                          ))}
                        </div>
                      )}

                    {selectedUnit && (
                      <p className="mt-2 text-sm font-medium text-emerald-700">
                        ✓ Casa {getHouseNumber(selectedUnit.code)} seleccionada
                      </p>
                    )}

                    {!unitsLoading && units.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {units.length} casas disponibles.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-700">
                        Fotografía del paquete
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#1E3A5F] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                        required
                      />
                    </label>

                    {photo && (
                      <p className="mt-1 truncate text-xs text-emerald-700">
                        Fotografía seleccionada: {photo.name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-auto border-t border-slate-100 bg-white pt-4">
                  <button
                    type="submit"
                    disabled={loading || unitsLoading || units.length === 0}
                    className="w-full rounded-lg bg-[#1E3A5F] py-3 text-sm font-semibold text-white transition hover:bg-[#152945] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? 'Guardando paquete...' : 'Registrar paquete'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}


