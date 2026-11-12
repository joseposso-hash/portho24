'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Session = {
  id: string;
  tenant_id: string;
  vehicle_id: string | null;
  unit_id: string | null;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  amount_due: number | null;
  amount_paid: number | null;
  payment_status: string | null;
  payer_type: string | null;
  payer_user_id: string | null;
  charge_authorization_status: string | null;
  authorized_by: string | null;
  authorized_at: string | null;
  tariff_snapshot: unknown;
};

type Payment = {
  id: string;
  tenant_id: string;
  parking_session_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

type Reversal = {
  id: string;
  parking_session_id: string;
  parking_payment_id: string;
  amount: number;
  reason: string;
  created_at: string;
};

type Vehicle = { id: string; plate: string };
type Unit = { id: string; code: string };

const money = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value || 0);

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

const methodName: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
};

export default function AdminParqueaderoPage() {
  const [tenantId, setTenantId] = useState('');
  const [sesiones, setSesiones] = useState<Session[]>([]);
  const [pagos, setPagos] = useState<Payment[]>([]);
  const [reversiones, setReversiones] = useState<Reversal[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehicle[]>([]);
  const [unidades, setUnidades] = useState<Unit[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('all');
  const [sesionSeleccionada, setSesionSeleccionada] = useState<Session | null>(null);
  const [pagoSeleccionado, setPagoSeleccionado] = useState<Payment | null>(null);

  const [valorPago, setValorPago] = useState('');
  const [metodoPago, setMetodoPago] = useState('cash');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [valorReversion, setValorReversion] = useState('');
  const [motivoReversion, setMotivoReversion] = useState('');

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('No hay una sesión iniciada.');

      const { data: perfil, error: perfilError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (perfilError) throw perfilError;
      if (!perfil?.tenant_id) {
        throw new Error('No se pudo identificar el conjunto del administrador.');
      }

      const idTenant = perfil.tenant_id;
      setTenantId(idTenant);

      const [sesionesRes, pagosRes, reversionesRes, vehiculosRes, unidadesRes] =
        await Promise.all([
          supabase
            .from('parking_sessions')
            .select(
              'id, tenant_id, vehicle_id, unit_id, status, check_in_at, check_out_at, amount_due, amount_paid, payment_status, payer_type, payer_user_id, charge_authorization_status, authorized_by, authorized_at, tariff_snapshot'
            )
            .eq('tenant_id', idTenant)
            .order('check_in_at', { ascending: false })
            .limit(500),

          supabase
            .from('parking_payments')
            .select(
              'id, tenant_id, parking_session_id, amount, payment_method, reference, notes, created_at'
            )
            .eq('tenant_id', idTenant)
            .order('created_at', { ascending: false })
            .limit(1000),

          supabase
            .from('parking_payment_reversals')
            .select(
              'id, parking_session_id, parking_payment_id, amount, reason, created_at'
            )
            .eq('tenant_id', idTenant)
            .order('created_at', { ascending: false })
            .limit(1000),

          supabase
            .from('vehicles')
            .select('id, plate')
            .eq('tenant_id', idTenant),

          supabase
            .from('units')
            .select('id, code, towers!inner(tenant_id)')
            .eq('towers.tenant_id', idTenant),
        ]);

      if (sesionesRes.error) throw sesionesRes.error;
      if (pagosRes.error) throw pagosRes.error;
      if (reversionesRes.error) throw reversionesRes.error;
      if (vehiculosRes.error) throw vehiculosRes.error;
      if (unidadesRes.error) throw unidadesRes.error;

      setSesiones((sesionesRes.data || []) as Session[]);
      setPagos((pagosRes.data || []) as Payment[]);
      setReversiones((reversionesRes.data || []) as Reversal[]);
      setVehiculos((vehiculosRes.data || []) as Vehicle[]);
      setUnidades((unidadesRes.data || []) as Unit[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar el parqueadero.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const placaDe = (id: string | null) =>
    vehiculos.find((v) => v.id === id)?.plate || 'Sin placa';

  const casaDe = (id: string | null) =>
    unidades.find((u) => u.id === id)?.code || 'Visitante / sin casa';

  const totalRevertidoPago = (id: string) =>
    reversiones
      .filter((r) => r.parking_payment_id === id)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const totalPagadoSesion = (id: string) =>
    pagos
      .filter((p) => p.parking_session_id === id)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalRevertidoSesion = (id: string) =>
    reversiones
      .filter((r) => r.parking_session_id === id)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const saldoSesion = (s: Session) =>
    Math.max(
      0,
      Number(s.amount_due || 0) -
        totalPagadoSesion(s.id) +
        totalRevertidoSesion(s.id)
    );

  const sesionesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return sesiones.filter((s) => {
      const placa = placaDe(s.vehicle_id).toLowerCase();
      const casa = casaDe(s.unit_id).toLowerCase();
      const coincideTexto = !texto || placa.includes(texto) || casa.includes(texto);

      const saldo = saldoSesion(s);
      const estado = s.payment_status || 'pending';

      let coincideFiltro = true;
      if (filtro === 'pending') coincideFiltro = saldo > 0 && s.status !== 'active';
      if (filtro === 'partial') coincideFiltro = estado === 'partial';
      if (filtro === 'paid') coincideFiltro = estado === 'paid' && saldo === 0;
      if (filtro === 'approval')
        coincideFiltro = s.charge_authorization_status === 'pending';
      if (filtro === 'approved')
        coincideFiltro = s.charge_authorization_status === 'approved';
      if (filtro === 'rejected')
        coincideFiltro = s.charge_authorization_status === 'rejected';

      return coincideTexto && coincideFiltro;
    });
  }, [sesiones, pagos, reversiones, vehiculos, unidades, busqueda, filtro]);

  const totalLiquidado = sesiones.reduce(
    (sum, s) => sum + Number(s.amount_due || 0),
    0
  );
  const totalRecaudado = pagos.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalReversiones = reversiones.reduce(
    (sum, r) => sum + Number(r.amount || 0),
    0
  );
  const recaudoNeto = totalRecaudado - totalReversiones;
  const saldoPendiente = sesiones.reduce((sum, s) => sum + saldoSesion(s), 0);
  const autorizacionesPendientes = sesiones.filter(
    (s) => s.charge_authorization_status === 'pending'
  ).length;

  const puedeCobrar = (s: Session) =>
    s.status !== 'active' &&
    s.payment_status !== 'cancelled' &&
    s.payment_status !== 'no_charge' &&
    saldoSesion(s) > 0 &&
    (s.payer_type !== 'resident' ||
      s.charge_authorization_status === 'approved');

  async function registrarPago(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sesionSeleccionada) return;

    const monto = Number(valorPago);
    const saldo = saldoSesion(sesionSeleccionada);

    if (!Number.isFinite(monto) || monto <= 0) {
      setError('Ingresa un valor de pago válido.');
      return;
    }
    if (monto > saldo) {
      setError(`El pago supera el saldo pendiente de ${money(saldo)}.`);
      return;
    }

    setProcesando(true);
    setError('');
    setMensaje('');

    try {
      const { error: rpcError } = await supabase.rpc('record_parking_payment', {
        p_session_id: sesionSeleccionada.id,
        p_amount: monto,
        p_payment_method: metodoPago,
        p_reference: referencia.trim() || null,
        p_notes: notas.trim() || null,
      });

      if (rpcError) throw rpcError;

      setMensaje('Pago registrado correctamente.');
      setSesionSeleccionada(null);
      setValorPago('');
      setReferencia('');
      setNotas('');
      await cargarDatos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible registrar el pago.');
    } finally {
      setProcesando(false);
    }
  }

  async function registrarReversion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pagoSeleccionado) return;

    const monto = Number(valorReversion);
    const disponible = Math.max(
      0,
      Number(pagoSeleccionado.amount) - totalRevertidoPago(pagoSeleccionado.id)
    );

    if (!Number.isFinite(monto) || monto <= 0 || monto > disponible) {
      setError(`La reversión debe ser positiva y no superar ${money(disponible)}.`);
      return;
    }
    if (motivoReversion.trim().length < 5) {
      setError('Explica el motivo de la reversión con al menos 5 caracteres.');
      return;
    }

    if (!window.confirm(`¿Confirmas reversar ${money(monto)} de este pago?`)) return;

    setProcesando(true);
    setError('');
    setMensaje('');

    try {
      const { error: rpcError } = await supabase.rpc('reverse_parking_payment', {
        p_session_id: pagoSeleccionado.parking_session_id,
        p_payment_id: pagoSeleccionado.id,
        p_amount: monto,
        p_reason: motivoReversion.trim(),
      });

      if (rpcError) throw rpcError;

      setMensaje('Reversión registrada correctamente.');
      setPagoSeleccionado(null);
      setValorReversion('');
      setMotivoReversion('');
      await cargarDatos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible registrar la reversión.');
    } finally {
      setProcesando(false);
    }
  }

  const etiquetaEstado = (estado: string | null) => {
    const textos: Record<string, string> = {
      pending: 'Pendiente',
      partial: 'Parcial',
      paid: 'Pagado',
      cancelled: 'Cancelado',
      no_charge: 'Sin cobro',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      not_required: 'No requiere',
    };
    return textos[estado || ''] || estado || 'Sin estado';
  };

  if (cargando) {
    return <div className="p-8 text-slate-500">Cargando administración de parqueadero...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Administración de parqueadero</h1>
          <p className="text-sm text-slate-500 mt-1">
            Control de liquidaciones, autorizaciones, pagos y reversiones.
          </p>
        </div>
        <button
          onClick={cargarDatos}
          disabled={cargando || procesando}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          Actualizar información
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-3 font-bold">Cerrar</button>
        </div>
      )}
      {mensaje && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {mensaje}
          <button onClick={() => setMensaje('')} className="ml-3 font-bold">Cerrar</button>
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ['Total liquidado', money(totalLiquidado), 'Valor de las sesiones'],
          ['Recaudo neto', money(recaudoNeto), 'Pagos menos reversiones'],
          ['Saldo pendiente', money(saldoPendiente), 'Saldo actual por cobrar'],
          ['Autorizaciones pendientes', String(autorizacionesPendientes), 'Esperando respuesta del residente'],
        ].map(([titulo, valor, detalle]) => (
          <div key={titulo} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{titulo}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{valor}</p>
            <p className="mt-1 text-xs text-slate-400">{detalle}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Sesiones y saldos</h2>
            <p className="text-xs text-slate-500">
              {sesionesFiltradas.length} registros encontrados · conjunto {tenantId.slice(0, 8)}
            </p>
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por placa o casa..."
            className="w-full md:w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'Todas'],
            ['pending', 'Con saldo'],
            ['partial', 'Parciales'],
            ['paid', 'Pagadas'],
            ['approval', 'Autorización pendiente'],
            ['approved', 'Autorizadas'],
            ['rejected', 'Rechazadas'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${
                filtro === value
                  ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="p-3">Vehículo / casa</th>
                <th className="p-3">Entrada / salida</th>
                <th className="p-3">Pagador</th>
                <th className="p-3">Autorización</th>
                <th className="p-3 text-right">Liquidado</th>
                <th className="p-3 text-right">Pagado</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {sesionesFiltradas.map((s) => {
                const saldo = saldoSesion(s);
                const pagado = totalPagadoSesion(s.id) - totalRevertidoSesion(s.id);
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{placaDe(s.vehicle_id)}</p>
                      <p className="text-xs text-slate-500">{casaDe(s.unit_id)}</p>
                    </td>
                    <td className="p-3 text-xs text-slate-600">
                      <p>{date(s.check_in_at)}</p>
                      <p className="text-slate-400">{date(s.check_out_at)}</p>
                    </td>
                    <td className="p-3 capitalize">{s.payer_type || '—'}</td>
                    <td className="p-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                        {etiquetaEstado(s.charge_authorization_status)}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">{money(Number(s.amount_due || 0))}</td>
                    <td className="p-3 text-right tabular-nums">{money(pagado)}</td>
                    <td className={`p-3 text-right font-bold tabular-nums ${saldo > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {money(saldo)}
                    </td>
                    <td className="p-3">
                      {puedeCobrar(s) ? (
                        <button
                          onClick={() => {
                            setSesionSeleccionada(s);
                            setValorPago(String(saldo));
                            setError('');
                          }}
                          className="rounded-lg bg-[#1E3A5F] px-3 py-2 text-xs font-semibold text-white hover:bg-[#294d78]"
                        >
                          Registrar pago
                        </button>
                      ) : s.status === 'active' ? (
                        <span className="text-xs text-slate-400">En curso</span>
                      ) : s.payer_type === 'resident' &&
                        s.charge_authorization_status === 'pending' ? (
                        <span className="text-xs text-amber-700">Esperando autorización</span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {etiquetaEstado(s.payment_status)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sesionesFiltradas.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">No hay sesiones para este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 space-y-3">
        <div>
          <h2 className="font-bold text-slate-900">Movimientos de pago</h2>
          <p className="text-xs text-slate-500">Los pagos registrados y sus reversiones individuales.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="p-3">Fecha</th>
                <th className="p-3">Vehículo</th>
                <th className="p-3">Medio</th>
                <th className="p-3">Referencia</th>
                <th className="p-3 text-right">Pago</th>
                <th className="p-3 text-right">Revertido</th>
                <th className="p-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => {
                const revertido = totalRevertidoPago(p.id);
                const disponible = Math.max(0, Number(p.amount) - revertido);
                const sesion = sesiones.find((s) => s.id === p.parking_session_id);
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3 text-xs">{date(p.created_at)}</td>
                    <td className="p-3">{sesion ? placaDe(sesion.vehicle_id) : '—'}</td>
                    <td className="p-3">{methodName[p.payment_method] || p.payment_method}</td>
                    <td className="p-3 text-xs">{p.reference || '—'}</td>
                    <td className="p-3 text-right font-semibold">{money(Number(p.amount))}</td>
                    <td className="p-3 text-right text-red-700">{money(revertido)}</td>
                    <td className="p-3">
                      {disponible > 0 ? (
                        <button
                          onClick={() => {
                            setPagoSeleccionado(p);
                            setValorReversion(String(disponible));
                            setError('');
                          }}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Reversar
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Revertido</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pagos.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400">Todavía no hay pagos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 space-y-3">
        <h2 className="font-bold text-slate-900">Historial de reversiones</h2>
        {reversiones.length === 0 ? (
          <p className="text-sm text-slate-400">No hay reversiones registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Sesión</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {reversiones.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3 text-xs">{date(r.created_at)}</td>
                    <td className="p-3 font-mono text-xs">{r.parking_session_id.slice(0, 8)}</td>
                    <td className="p-3">{r.reason}</td>
                    <td className="p-3 text-right font-semibold text-red-700">{money(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sesionSeleccionada && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={registrarPago} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Registrar pago</h2>
                <p className="text-sm text-slate-500">
                  {placaDe(sesionSeleccionada.vehicle_id)} · {casaDe(sesionSeleccionada.unit_id)}
                </p>
              </div>
              <button type="button" onClick={() => setSesionSeleccionada(null)} className="text-slate-400 text-xl">×</button>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span>Valor liquidado</span><b>{money(Number(sesionSeleccionada.amount_due || 0))}</b></div>
              <div className="mt-1 flex justify-between"><span>Saldo pendiente</span><b className="text-amber-700">{money(saldoSesion(sesionSeleccionada))}</b></div>
            </div>
            <label className="block text-sm font-semibold">
              Valor a recibir
              <input type="number" min="1" step="1" max={saldoSesion(sesionSeleccionada)} required value={valorPago} onChange={(e) => setValorPago(e.target.value)} className="mt-1 w-full rounded-lg border p-3" />
            </label>
            <label className="block text-sm font-semibold">
              Medio de pago
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="mt-1 w-full rounded-lg border p-3">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Referencia (opcional)
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border p-3" />
            </label>
            <label className="block text-sm font-semibold">
              Observaciones (opcional)
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border p-3" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSesionSeleccionada(null)} className="rounded-lg border px-4 py-2">Cancelar</button>
              <button disabled={procesando} className="rounded-lg bg-[#1E3A5F] px-5 py-2 font-semibold text-white disabled:opacity-50">
                {procesando ? 'Registrando...' : 'Confirmar pago'}
              </button>
            </div>
          </form>
        </div>
      )}

      {pagoSeleccionado && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={registrarReversion} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-red-700">Reversar pago</h2>
                <p className="text-sm text-slate-500">Pago original: {money(Number(pagoSeleccionado.amount))}</p>
                <p className="text-xs text-slate-500">Disponible para reversar: {money(Math.max(0, Number(pagoSeleccionado.amount) - totalRevertidoPago(pagoSeleccionado.id)))}</p>
              </div>
              <button type="button" onClick={() => setPagoSeleccionado(null)} className="text-slate-400 text-xl">×</button>
            </div>
            <label className="block text-sm font-semibold">
              Valor de la reversión
              <input type="number" min="1" step="1" required value={valorReversion} onChange={(e) => setValorReversion(e.target.value)} className="mt-1 w-full rounded-lg border p-3" />
            </label>
            <label className="block text-sm font-semibold">
              Motivo obligatorio
              <textarea required minLength={5} maxLength={500} rows={3} value={motivoReversion} onChange={(e) => setMotivoReversion(e.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="Describe el motivo de la reversión..." />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPagoSeleccionado(null)} className="rounded-lg border px-4 py-2">Cancelar</button>
              <button disabled={procesando} className="rounded-lg bg-red-700 px-5 py-2 font-semibold text-white disabled:opacity-50">
                {procesando ? 'Procesando...' : 'Confirmar reversión'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

