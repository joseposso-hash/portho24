'use client';

import { getHouseNumber } from '../../lib/house-number';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminReservas() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarReservas();
  }, []);

  async function cargarReservas() {
    setLoading(true);
    
    // Obtener tenant del usuario
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
    if (!profile) return;

    const { data } = await supabase
      .from('reservas')
      .select('*, areas_comunes(name, icon), units(code, towers(name)), reserva_movimientos_financieros(*)')
      .eq('tenant_id', profile.tenant_id) // <-- FILTRO
      .order('date', { ascending: false });
    if (data) setReservas(data);
    setLoading(false);
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    let motivo = null;
    if (nuevoEstado === 'rejected' || nuevoEstado === 'cancelled') {
      motivo = prompt(nuevoEstado === 'cancelled'
        ? 'Indica el motivo de la cancelación:'
        : 'Por favor, escribe el motivo del rechazo (ej: Salón ocupado, mantenimiento, etc.):');
      if (motivo === null) return;
      if (motivo.trim() === '') {
        alert('Debes escribir un motivo para rechazar la reserva.');
        return;
      }
    }

    const { error } = await supabase.from('reservas').update({ status: nuevoEstado, admin_notes: motivo }).eq('id', id);
    if (error) {
      alert('No fue posible actualizar la reserva: ' + error.message);
      return;
    }
    await cargarReservas();
  }

  async function validarPago(id: string, aprobado: boolean) {
    const { error } = await supabase
      .from('reserva_movimientos_financieros')
      .update({ verification_status: aprobado ? 'confirmed' : 'rejected' })
      .eq('id', id);

    if (error) {
      alert('No fue posible actualizar el pago: ' + error.message);
      return;
    }
    await cargarReservas();
  }

  async function abrirSoporte(path: string) {
    const { data, error } = await supabase.storage
      .from('reserva-soportes')
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      alert('No fue posible abrir el soporte: ' + (error?.message || 'URL no disponible'));
      return;
    }
    window.location.assign(data.signedUrl);
  }

  async function registrarDevolucion(reserva: any, pago: any) {
    const movimientos = Array.isArray(reserva.reserva_movimientos_financieros)
      ? reserva.reserva_movimientos_financieros
      : [];
    const yaDevuelto = movimientos
      .filter((m: any) => m.movement_type === 'refund' && m.reversal_of_id === pago.id && m.verification_status === 'confirmed')
      .reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0);
    const disponible = Math.max(0, Number(pago.amount) - yaDevuelto);
    if (disponible <= 0) {
      alert('Este pago ya fue devuelto en su totalidad.');
      return;
    }

    const valor = prompt(`Valor a devolver. Máximo disponible: ${disponible.toLocaleString('es-CO')} ${reserva.currency || 'COP'}`, String(disponible));
    if (valor === null) return;
    const amount = Number(valor);
    if (!Number.isFinite(amount) || amount <= 0 || amount > disponible) {
      alert('Ingresa un valor válido que no supere el saldo del pago original.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('La sesión expiró. Ingresa nuevamente.');
      return;
    }

    const { error } = await supabase.from('reserva_movimientos_financieros').insert({
      tenant_id: reserva.tenant_id,
      reserva_id: reserva.id,
      movement_type: 'refund',
      amount,
      reversal_of_id: pago.id,
      verification_status: 'confirmed',
      recorded_by: user.id,
      notes: 'Devolución registrada por administración',
    });

    if (error) {
      alert('No fue posible registrar la devolución: ' + error.message);
      return;
    }
    await cargarReservas();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Gestión de Reservas</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-6 py-4">Área</th>
                <th className="px-6 py-4">Residente</th>
                <th className="px-6 py-4">Fecha / Hora</th>
                <th className="px-6 py-4">Notas</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Finanzas</th>
                <th className="px-6 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">Cargando...</td></tr>
              ) : reservas.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">No hay reservas registradas.</td></tr>
              ) : (
                reservas.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      {(r.areas_comunes as any)?.icon} {(r.areas_comunes as any)?.name}
                    </td>
                    <td className="px-6 py-3 text-xs font-semibold text-[#1E3A5F]">
                      {(r.units as any)?.towers?.name} - {getHouseNumber((r.units as any)?.code)}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-700">
                      {r.date} <br/> {r.start_time} - {r.end_time}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {r.notes && <div><strong>Residente:</strong> {r.notes}</div>}
                      {r.admin_notes && <div className="text-red-600 mt-1"><strong>Admin:</strong> {r.admin_notes}</div>}
                      {!r.notes && !r.admin_notes && '-'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        r.status === 'pending' ? 'bg-amber-100 text-amber-800' : 
                        r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 
                        'bg-red-100 text-red-800'
                      }`}>
                        {r.status === 'pending' ? 'Pendiente' : r.status === 'approved' ? 'Aprobada' : r.status === 'cancelled' ? 'Cancelada' : 'Rechazada'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs">
                      <p className="font-semibold text-slate-800">{Number(r.amount_due || 0).toLocaleString('es-CO')} {r.currency || 'COP'}</p>
                      <p className="text-slate-500">Pagado: {Number(r.amount_paid || 0).toLocaleString('es-CO')}</p>
                      <p className="text-slate-500">Saldo: {(r.account_charge_status === 'reversed' ? 0 : Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0))).toLocaleString('es-CO')}</p>
                      {r.account_charge_status === 'reversed' && <p className="text-emerald-700">Cargo a cuenta reversado</p>}
                      {r.refund_status && r.refund_status !== 'not_applicable' && <p className="text-blue-700">Devolución: {r.refund_status === 'pending' ? 'Pendiente' : r.refund_status === 'partial' ? 'Parcial' : 'Completada'}</p>}
                      {Array.isArray(r.reserva_movimientos_financieros) && r.reserva_movimientos_financieros.filter((m: any) => m.support_path).map((m: any) => (
                        <button key={m.id} onClick={() => abrirSoporte(m.support_path)} className="mt-1 block text-blue-700 underline">Ver soporte del pago</button>
                      ))}
                      <p className="mt-1 font-medium">{r.payment_status === 'paid' ? 'Pagado' : r.payment_status === 'partial' ? 'Parcial' : r.payment_status === 'not_required' ? 'Sin cobro' : 'Pendiente'}</p>
                      {Array.isArray(r.reserva_movimientos_financieros) && r.reserva_movimientos_financieros.filter((m: any) => m.verification_status === 'pending').map((m: any) => (
                        <div key={m.id} className="mt-2 rounded-lg bg-amber-50 p-2">
                          <p className="mb-1">Pago reportado: {Number(m.amount).toLocaleString('es-CO')} · {m.payment_method || 'Medio no indicado'}</p>
                          {m.reference && <p>Ref: {m.reference}</p>}
                          {m.support_path && <button onClick={() => abrirSoporte(m.support_path)} className="mt-1 text-blue-700 underline">Ver soporte</button>}
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => validarPago(m.id, true)} className="rounded bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">Confirmar</button>
                            <button onClick={() => validarPago(m.id, false)} className="rounded bg-red-100 px-2 py-1 font-semibold text-red-700">Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </td>
                    <td className="px-6 py-3 flex gap-2">
                      {r.status === 'pending' && (
                        <>
                          <button onClick={() => cambiarEstado(r.id, 'approved')} className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded hover:bg-emerald-200 font-medium">Aprobar</button>
                          <button onClick={() => cambiarEstado(r.id, 'rejected')} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200 font-medium">Rechazar</button>
                          <button onClick={() => cambiarEstado(r.id, 'cancelled')} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">Cancelar</button>
                        </>
                      )}
                      {r.status === 'approved' && (
                        <button onClick={() => cambiarEstado(r.id, 'cancelled')} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">Cancelar</button>
                      )}
                      {r.status === 'cancelled' && (
                        <div className="min-w-36 space-y-2">
                          <p className="font-semibold text-slate-700">Devoluciones: {r.refund_status === 'refunded' ? 'Completadas' : r.refund_status === 'partial' ? 'Parciales' : r.refund_status === 'pending' ? 'Pendientes' : 'No aplica'}</p>
                          {Array.isArray(r.reserva_movimientos_financieros) && r.reserva_movimientos_financieros
                            .filter((m: any) => m.movement_type === 'payment' && m.verification_status === 'confirmed')
                            .map((pago: any) => {
                              const devuelto = r.reserva_movimientos_financieros
                                .filter((m: any) => m.movement_type === 'refund' && m.reversal_of_id === pago.id && m.verification_status === 'confirmed')
                                .reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0);
                              return Number(pago.amount) > devuelto ? (
                                <button key={pago.id} onClick={() => registrarDevolucion(r, pago)} className="block text-xs rounded bg-blue-50 px-2 py-1 text-blue-800">
                                  Devolver saldo ({(Number(pago.amount) - devuelto).toLocaleString('es-CO')})
                                </button>
                              ) : null;
                            })}
                        </div>
                      )}
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
