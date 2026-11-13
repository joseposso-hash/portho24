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
      .select('*, areas_comunes(name, icon), units(code, towers(name))')
      .eq('tenant_id', profile.tenant_id) // <-- FILTRO
      .order('date', { ascending: false });
    if (data) setReservas(data);
    setLoading(false);
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    let motivo = null;
    if (nuevoEstado === 'rejected') {
      motivo = prompt('Por favor, escribe el motivo del rechazo (ej: Salón ocupado, mantenimiento, etc.):');
      if (motivo === null) return;
      if (motivo.trim() === '') {
        alert('Debes escribir un motivo para rechazar la reserva.');
        return;
      }
    }

    await supabase.from('reservas').update({ status: nuevoEstado, admin_notes: motivo }).eq('id', id);
    cargarReservas();
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
                <th className="px-6 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">Cargando...</td></tr>
              ) : reservas.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay reservas registradas.</td></tr>
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
                        {r.status === 'pending' ? 'Pendiente' : r.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                      </span>
                    </td>
                    <td className="px-6 py-3 flex gap-2">
                      {r.status === 'pending' && (
                        <>
                          <button onClick={() => cambiarEstado(r.id, 'approved')} className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded hover:bg-emerald-200 font-medium">Aprobar</button>
                          <button onClick={() => cambiarEstado(r.id, 'rejected')} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200 font-medium">Rechazar</button>
                        </>
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
