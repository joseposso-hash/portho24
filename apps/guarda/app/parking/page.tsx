
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { formatUnitLabel, type HousingModel } from '../lib/tenant-config';

import { uploadEvidence } from '../lib/evidencias-client';
type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other';

type ClosureInfo = {
  sessionId: string;
  amountDue: number;
  amountPaid: number;
  payerType: 'visitor' | 'resident';
  residentName?: string;
};

function ParkingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const visitIdParam = searchParams.get('visit_id');
  const nombreParam = searchParams.get('nombre');
  const docParam = searchParams.get('doc');
  const casaParam = searchParams.get('casa');
  const unitIdParam = searchParams.get('unit_id');

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [housingModel, setHousingModel] = useState<HousingModel>('units');
  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');

  const [placa, setPlaca] = useState('');
  const [conductor, setConductor] = useState(nombreParam || '');
  const [docConductor, setDocConductor] = useState(docParam || '');
  const [fotoConductor, setFotoConductor] = useState<File | null>(null);
  const [fotoVehiculo, setFotoVehiculo] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [vehiculo, setVehiculo] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [payerType, setPayerType] = useState<'visitor' | 'resident'>('visitor');
  const [residentOptions, setResidentOptions] = useState<any[]>([]);
  const [residentPayerId, setResidentPayerId] = useState('');

  const [cierreInfo, setCierreInfo] = useState<ClosureInfo | null>(null);
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('cash');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [notasPago, setNotasPago] = useState('');

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile, error } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (error || !profile?.tenant_id) return;

      const currentTenantId = profile.tenant_id as string;
      setTenantId(currentTenantId);

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('housing_model')
        .eq('id', currentTenantId)
        .maybeSingle();

      if (tenantError && tenantError.code !== '42703') {
        console.error('Error consultando modelo de vivienda:', tenantError);
      } else if (!tenantError && tenant?.housing_model) {
        setHousingModel(tenant.housing_model as HousingModel);
      }

      const { data: towers, error: towersError } = await supabase
        .from('towers')
        .select('id, name')
        .eq('tenant_id', currentTenantId)
        .order('name');

      if (towersError) {
        console.error('Error cargando torres:', towersError);
        return;
      }

      const towerIds = (towers || []).map((tower: any) => tower.id);
      const towerNames = new Map(
        (towers || []).map((tower: any) => [tower.id, tower.name])
      );

      if (!towerIds.length) {
        setUnits([]);
        return;
      }

      const { data: unitData, error: unitsError } = await supabase
        .from('units')
        .select('id, code, tower_id')
        .in('tower_id', towerIds)
        .order('code');

      if (unitsError) {
        console.error('Error cargando viviendas:', unitsError);
        return;
      }

      const availableUnits = (unitData || []).map((unit: any) => ({
        ...unit,
        towerName: towerNames.get(unit.tower_id) || '',
      }));
      setUnits(availableUnits);

      if (unitIdParam && availableUnits.some((unit: any) => unit.id === unitIdParam)) {
        setUnitId(unitIdParam);
      } else if (casaParam) {
        const normalized = casaParam.trim().toLowerCase();
        const matches = availableUnits.filter((unit: any) =>
          String(unit.code).toLowerCase() === normalized ||
          formatUnitLabel(unit.code, unit.towerName, tenant?.housing_model || 'units').toLowerCase() === normalized
        );
        if (matches.length === 1) setUnitId(matches[0].id);
      }
    }

    void init();
  }, []);

  function formatoDinero(valor: number) {
    return `$${valor.toLocaleString('es-CO')}`;
  }

  function limpiarBusqueda() {
    setVehiculo(null);
    setCierreInfo(null);
    setResidentOptions([]);
    setResidentPayerId('');
    setPayerType('visitor');
    setMontoPago('');
    setMetodoPago('cash');
    setReferenciaPago('');
    setNotasPago('');
    setErrorMsg(null);
    setPlaca('');
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();

    if (!placa.trim() || !tenantId) {
      setErrorMsg('Ingresa una placa y espera a que cargue el conjunto.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setCierreInfo(null);
    setPayerType('visitor');
    setResidentPayerId('');
    setResidentOptions([]);

    const placaUpper = placa.trim().toUpperCase();

    try {
      const { data: vehiculosEncontrados, error: vehError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('plate', placaUpper)
        .eq('tenant_id', tenantId)
        .limit(1);

      if (vehError) throw vehError;

      let veh =
        vehiculosEncontrados && vehiculosEncontrados.length > 0
          ? vehiculosEncontrados[0]
          : null;

      if (!veh) {
        const { data: newVeh, error: errNewVeh } = await supabase
          .from('vehicles')
          .insert({
            tenant_id: tenantId,
            plate: placaUpper,
            type: 'car',
          })
          .select()
          .single();

        if (errNewVeh) throw errNewVeh;
        veh = newVeh;
      }

      const { data: sessions, error: errSes } = await supabase
        .from('parking_sessions')
        .select('*')
        .eq('vehicle_id', veh.id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .limit(1);

      if (errSes) throw errSes;

      const activeSession =
        sessions && sessions.length > 0 ? sessions[0] : null;

      if (activeSession?.unit_id) {
        const { data: residentes, error: residentesError } = await supabase
          .from('users')
          .select('id, full_name, email')
          .eq('tenant_id', tenantId)
          .eq('unit_id', activeSession.unit_id)
          .eq('role', 'resident')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (residentesError) {
          console.error('Error consultando residentes:', residentesError);
          setErrorMsg(
            'Vehículo encontrado. No fue posible consultar los residentes; puedes registrar la salida a cargo del visitante.'
          );
          setResidentOptions([]);
        } else {
          const opciones = residentes || [];
          setResidentOptions(opciones);

          if (opciones.length === 1) {
            setResidentPayerId(opciones[0].id);
          }
        }
      }

      setVehiculo({
        ...veh,
        activeSession,
      });
    } catch (err: any) {
      setVehiculo(null);
      setErrorMsg(err.message || 'Error al buscar la placa.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmarEntrada() {
    if (
      !unitId ||
      !conductor.trim() ||
      !docConductor.trim() ||
      !fotoConductor ||
      !fotoVehiculo ||
      !tenantId ||
      !vehiculo?.id
    ) {
      setErrorMsg('Selecciona la vivienda de destino, completa los datos y toma ambas fotos.');
      return;
    }

    const selectedUnit = units.find((unit) => unit.id === unitId);
    if (!selectedUnit) {
      setErrorMsg('La vivienda seleccionada ya no está disponible. Actualiza e inténtalo nuevamente.');
      return;
    }
    const destinoLabel = formatUnitLabel(
      selectedUnit.code,
      selectedUnit.towerName,
      housingModel
    );

    setErrorMsg(null);
    setLoading(true);

    try {

      const urlConductor = await uploadEvidence(fotoConductor, 'conductor');
      const urlVehiculo = await uploadEvidence(fotoVehiculo, 'vehiculo');

      const ahora = new Date().toISOString();

      const { error } = await supabase.from('parking_sessions').insert({
        tenant_id: tenantId,
        vehicle_id: vehiculo.id,
        unit_id: selectedUnit.id,
        visit_id: visitIdParam || null,
        status: 'active',
        check_in_at: ahora,
        created_at: ahora,
        notes: `Conductor: ${conductor.trim()} - Doc: ${docConductor.trim()} - Destino: ${destinoLabel}`,
        photo_url: urlVehiculo,
        driver_photo_url: urlConductor,
      });

      if (error) throw error;

      alert(
        `Vehículo ingresado.\nConductor: ${conductor}\nDestino: ${destinoLabel}`
      );

      router.push('/');
    } catch (err: any) {
      console.error('Error registrando entrada:', err);
      setErrorMsg('Error al registrar entrada: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmarSalida() {
    const sessionId = vehiculo?.activeSession?.id;

    if (!sessionId) {
      setErrorMsg('No se encontró una sesión activa para este vehículo.');
      return;
    }

    if (payerType === 'resident') {
      if (!residentOptions.length) {
        setErrorMsg(
          'No hay residentes activos disponibles para asumir este cobro.'
        );
        return;
      }

      if (
        !residentPayerId ||
        !residentOptions.some(
          (residente: any) => residente.id === residentPayerId
        )
      ) {
        setErrorMsg('Selecciona un residente válido como responsable del pago.');
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const residenteSeleccionado = residentOptions.find(
        (residente: any) => residente.id === residentPayerId
      );

      const { data: cierre, error: cierreError } = await supabase.rpc(
        'close_parking_session',
        {
          p_session_id: sessionId,
          p_payer_type: payerType,
          p_payer_user_id:
            payerType === 'resident' ? residentPayerId : null,
        }
      );

      if (cierreError) throw cierreError;

      const total = Number(cierre?.amount_due ?? 0);

      if (!Number.isFinite(total) || total < 0) {
        throw new Error('El sistema devolvió un valor de cobro inválido.');
      }

      setVehiculo((actual: any) =>
        actual ? { ...actual, activeSession: null } : actual
      );

      if (total === 0) {
        setCierreInfo({
          sessionId,
          amountDue: 0,
          amountPaid: 0,
          payerType,
        });

        alert('Salida registrada. Esta sesión no generó ningún cobro.');
        return;
      }

      setCierreInfo({
        sessionId,
        amountDue: total,
        amountPaid: 0,
        payerType,
        residentName: residenteSeleccionado?.full_name || residenteSeleccionado?.email,
      });

      setMontoPago(payerType === 'visitor' ? String(total) : '');

      if (payerType === 'resident') {
        alert(
          `Salida registrada. Se solicitó autorización al residente. Valor liquidado: ${formatoDinero(
            total
          )}. La autorización no representa un pago.`
        );
      }
    } catch (err: any) {
      console.error('Error al registrar salida:', err);
      setErrorMsg(err.message || 'No fue posible registrar la salida.');
    } finally {
      setLoading(false);
    }
  }

  async function registrarPago() {
    if (!cierreInfo || cierreInfo.payerType !== 'visitor') {
      setErrorMsg('No hay un cobro de visitante disponible para registrar.');
      return;
    }

    const monto = Number(montoPago);
    const saldo = cierreInfo.amountDue - cierreInfo.amountPaid;

    if (!Number.isFinite(monto) || monto <= 0) {
      setErrorMsg('Ingresa un valor de pago mayor que cero.');
      return;
    }

    if (monto > saldo) {
      setErrorMsg(
        `El pago no puede superar el saldo pendiente de ${formatoDinero(
          saldo
        )}.`
      );
      return;
    }

    if (!metodoPago) {
      setErrorMsg('Selecciona el medio de pago.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error: pagoError } = await supabase.rpc(
        'record_parking_payment',
        {
          p_session_id: cierreInfo.sessionId,
          p_amount: monto,
          p_payment_method: metodoPago,
          p_reference: referenciaPago.trim() || null,
          p_notes: notasPago.trim() || 'Pago recibido en portería',
        }
      );

      if (pagoError) throw pagoError;

      const nuevoPagado = cierreInfo.amountPaid + monto;
      const nuevoSaldo = Math.max(0, cierreInfo.amountDue - nuevoPagado);

      setCierreInfo({
        ...cierreInfo,
        amountPaid: nuevoPagado,
      });

      setMontoPago(nuevoSaldo > 0 ? String(nuevoSaldo) : '');
      setReferenciaPago('');
      setNotasPago('');

      if (nuevoSaldo === 0) {
        alert(
          `Pago registrado correctamente. Sesión pagada en su totalidad: ${formatoDinero(
            nuevoPagado
          )}.`
        );
      } else {
        alert(
          `Pago parcial registrado: ${formatoDinero(
            monto
          )}.\nSaldo pendiente: ${formatoDinero(nuevoSaldo)}.`
        );
      }
    } catch (err: any) {
      console.error('Error registrando pago:', err);
      setErrorMsg(
        err.message ||
          'No fue posible registrar el pago. El saldo continúa pendiente.'
      );
    } finally {
      setLoading(false);
    }
  }

  const saldoPendiente = cierreInfo
    ? Math.max(0, cierreInfo.amountDue - cierreInfo.amountPaid)
    : 0;

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-lg mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Control de Vehículos
          </h1>
          {visitIdParam && (
            <p className="text-xs text-emerald-600 font-medium">
              Continuando registro de visita...
            </p>
          )}
        </div>

        <button
          onClick={() => router.push('/')}
          className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50"
        >
          ← Volver
        </button>
      </header>

      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        {!vehiculo ? (
          <form onSubmit={handleBuscar} className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-slate-900">
                Ingresa la placa
              </h2>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <input
              type="text"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full text-center text-4xl font-black tracking-widest text-slate-900 border-b-2 border-slate-300 focus:border-emerald-500 focus:outline-none pb-4 uppercase"
              required
            />

            <button
              type="submit"
              disabled={loading || placa.trim().length < 5 || !tenantId}
              className="w-full rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50"
            >
              {loading ? 'Buscando...' : 'Buscar Placa'}
            </button>
          </form>
        ) : cierreInfo ? (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                Salida registrada
              </h2>
              <p className="text-3xl font-black text-slate-700 tracking-widest mt-2">
                {vehiculo.plate}
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex justify-between gap-3">
                <span className="text-sm text-slate-600">Valor liquidado</span>
                <strong className="text-slate-900">
                  {formatoDinero(cierreInfo.amountDue)}
                </strong>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-sm text-slate-600">Pagos registrados</span>
                <strong className="text-emerald-700">
                  {formatoDinero(cierreInfo.amountPaid)}
                </strong>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-between gap-3">
                <span className="font-semibold text-slate-800">
                  Saldo pendiente
                </span>
                <strong className="text-lg text-amber-700">
                  {formatoDinero(saldoPendiente)}
                </strong>
              </div>
            </div>

            {cierreInfo.amountDue === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-emerald-800">
                Esta sesión no generó ningún cobro.
              </div>
            ) : cierreInfo.payerType === 'resident' ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="font-semibold text-blue-900">
                    Autorización solicitada al residente
                  </p>
                  <p className="mt-2 text-sm text-blue-800">
                    {cierreInfo.residentName
                      ? `Responsable: ${cierreInfo.residentName}. `
                      : ''}
                    El residente debe aprobar el cobro desde su cuenta. Esta
                    autorización no registra ni confirma un pago.
                  </p>
                </div>

                <p className="text-sm text-slate-500">
                  Una vez autorizado, el administrador o guarda podrá registrar
                  los pagos correspondientes.
                </p>
              </div>
            ) : saldoPendiente > 0 ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-800">
                    Registrar pago del visitante
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Puedes registrar un pago total o parcial. El saldo restante
                    quedará pendiente.
                  </p>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Valor recibido
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={saldoPendiente}
                    step="1"
                    inputMode="numeric"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    placeholder="Ingresa el valor recibido"
                    disabled={loading}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-lg font-semibold text-slate-900"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Máximo permitido: {formatoDinero(saldoPendiente)}
                  </span>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Medio de pago
                  </span>
                  <select
                    value={metodoPago}
                    onChange={(e) =>
                      setMetodoPago(e.target.value as PaymentMethod)
                    }
                    disabled={loading}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                    <option value="other">Otro</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Referencia o comprobante (opcional)
                  </span>
                  <input
                    type="text"
                    value={referenciaPago}
                    onChange={(e) => setReferenciaPago(e.target.value)}
                    maxLength={150}
                    placeholder="Número de transacción o comprobante"
                    disabled={loading}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Observaciones (opcional)
                  </span>
                  <textarea
                    value={notasPago}
                    onChange={(e) => setNotasPago(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Observaciones del pago"
                    disabled={loading}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  />
                </label>

                <button
                  type="button"
                  onClick={registrarPago}
                  disabled={
                    loading ||
                    !montoPago ||
                    Number(montoPago) <= 0 ||
                    Number(montoPago) > saldoPendiente
                  }
                  className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Registrando pago...' : 'Registrar pago'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMontoPago('');
                    setErrorMsg(null);
                  }}
                  disabled={loading}
                  className="w-full rounded-xl bg-slate-200 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Dejar saldo pendiente
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="font-semibold text-emerald-800">
                  Pago completado
                </p>
                <p className="mt-1 text-sm text-emerald-700">
                  No queda saldo pendiente para esta sesión.
                </p>
              </div>
            )}

            <button
  type="button"
  onClick={limpiarBusqueda}
  disabled={loading}
  className="w-full rounded-xl bg-slate-200 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
>
  Finalizar y dejar saldo pendiente
</button>
          </div>
        ) : vehiculo.activeSession ? (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                Salida de Vehículo
              </h2>
              <p className="text-3xl font-black text-slate-700 tracking-widest mt-2">
                {vehiculo.plate}
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-medium text-emerald-700">
                Tarifa calculada por el sistema
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-800">
                El valor se calculará al registrar la salida.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800">
                Responsable del pago
              </h3>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setPayerType('visitor');
                  setResidentPayerId('');
                  setErrorMsg(null);
                }}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  payerType === 'visitor'
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <span className="block font-semibold text-slate-800">
                  Visitante
                </span>
                <span className="block text-sm text-slate-500">
                  El visitante paga en portería o deja saldo pendiente.
                </span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setPayerType('resident');
                  setErrorMsg(null);
                }}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  payerType === 'resident'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <span className="block font-semibold text-slate-800">
                  Residente de la vivienda
                </span>
                <span className="block text-sm text-slate-500">
                  Se solicitará autorización digital antes de registrar el
                  cobro.
                </span>
              </button>
            </div>

            {payerType === 'resident' && (
              <div className="space-y-2">
                <label
                  htmlFor="residentPayer"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Seleccionar residente responsable
                </label>

                {residentOptions.length > 0 ? (
                  <select
                    id="residentPayer"
                    value={residentPayerId}
                    onChange={(e) => setResidentPayerId(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecciona un residente</option>
                    {residentOptions.map((residente: any) => (
                      <option key={residente.id} value={residente.id}>
                        {residente.full_name || residente.email || 'Residente'}
                        {residente.email ? ` — ${residente.email}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    No hay residentes activos disponibles para esta vivienda. No se
                    puede solicitar un cobro a residente.
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {payerType === 'resident' ? (
                <button
                  type="button"
                  onClick={confirmarSalida}
                  disabled={
                    loading || !residentOptions.length || !residentPayerId
                  }
                  className="w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? 'Procesando...'
                    : 'Solicitar autorización y dar salida'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={confirmarSalida}
                    disabled={loading}
                    className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {loading ? 'Procesando...' : 'Liquidar y registrar salida'}
                  </button>

                  <p className="text-center text-xs text-slate-500">
                    Después de liquidar podrás registrar el pago total, parcial
                    o dejar el saldo pendiente.
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={limpiarBusqueda}
              disabled={loading}
              className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Buscar otro vehículo
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                Registrar Entrada
              </h2>
              <p className="text-3xl font-black text-slate-700 tracking-widest mt-2">
                {vehiculo.plate}
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Vivienda de destino
                </span>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
                  required
                >
                  <option value="">Seleccionar vivienda</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {formatUnitLabel(unit.code, unit.towerName, housingModel)}
                    </option>
                  ))}
                </select>
                {!units.length && (
                  <span className="mt-1 block text-xs text-amber-700">
                    No hay viviendas disponibles para este conjunto.
                  </span>
                )}
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Nombre del Conductor
                </span>
                <input
                  type="text"
                  value={conductor}
                  onChange={(e) => setConductor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Documento
                </span>
                <input
                  type="text"
                  value={docConductor}
                  onChange={(e) => setDocConductor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  required
                />
              </label>
            </div>

            <div>
              <span className="text-sm font-medium text-slate-700 block mb-2">
                Foto del Conductor
              </span>
              <label className="flex items-center justify-center w-full h-20 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                <span className="flex flex-col items-center space-y-1">
                  <span className="text-2xl">🧑</span>
                  <span className="font-medium text-slate-600 text-xs">
                    {fotoConductor
                      ? '✓ Foto conductor capturada'
                      : 'Tomar foto del conductor'}
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(e) =>
                    setFotoConductor(e.target.files?.[0] || null)
                  }
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <span className="text-sm font-medium text-slate-700 block mb-2">
                Foto del Vehículo
              </span>
              <label className="flex items-center justify-center w-full h-20 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                <span className="flex flex-col items-center space-y-1">
                  <span className="text-2xl">🚗</span>
                  <span className="font-medium text-slate-600 text-xs">
                    {fotoVehiculo
                      ? '✓ Foto vehículo capturada'
                      : 'Tomar foto del vehículo'}
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) =>
                    setFotoVehiculo(e.target.files?.[0] || null)
                  }
                  className="hidden"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={confirmarEntrada}
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Registrando...' : 'Dar Entrada al Vehículo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ParkingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          Cargando...
        </div>
      }
    >
      <ParkingContent />
    </Suspense>
  );
}
