'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminVehiculos() {
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');

  useEffect(() => {
    cargar();
  }, [fechaFiltro]);

  async function cargar() {
    setLoading(true);
    let query = supabase
      .from('parking_sessions')
      .select('*, vehicles(plate)')
      .order('check_in_at', { ascending: false })
      .limit(100);

    if (fechaFiltro) {
      const inicio = `${fechaFiltro}T00:00:00`;
      const fin = `${fechaFiltro}T23:59:59`;
      query = query.gte('check_in_at', inicio).lte('check_in_at', fin);
    }

    const { data } = await query;
    if (data) setVehiculos(data);
    setLoading(false);
  }

  const filtrados = vehiculos.filter(v => 
    (v.vehicles as any)?.plate?.toLowerCase().includes(busqueda.toLowerCase()) || 
    v.notes?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const getDatos = (v: any) => {
    const notes = v.notes || '';
    const matchCond = notes.match(/Conductor:\s*([^-]+)/i);
    const matchDest = notes.match(/Destino:\s*([^-]+)/i);
    return { 
      conductor: matchCond ? matchCond[1].trim() : '-', 
      destino: matchDest ? matchDest[1].trim() : 'No especificado' 
    };
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Historial de Vehículos</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
          <input type="text" placeholder="Buscar por placa o conductor..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none" />
          <div className="relative w-full md:w-auto">
            <input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none" />
            <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-slate-500 font-bold">FILTRAR FECHA (OPCIONAL)</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-4 py-3">Foto</th>
                <th className="px-4 py-3">Placa</th>
                <th className="px-4 py-3">Conductor</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Cobro</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Hora Ingreso</th>
                <th className="px-4 py-3">Hora Salida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={8} className="p-8 text-center">Cargando...</td></tr> : 
               filtrados.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">No hay vehículos registrados.</td></tr> :
               filtrados.map(v => {
                 const d = getDatos(v);
                 return (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{v.photo_url ? <img src={v.photo_url} className="h-10 w-10 object-cover rounded shadow-sm" /> : <div className="h-10 w-10 bg-slate-100 rounded border border-slate-200"></div>}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{(v.vehicles as any)?.plate}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700 flex items-center gap-2">
                      {v.driver_photo_url && <img src={v.driver_photo_url} className="h-6 w-6 object-cover rounded-full border border-slate-200" />}
                      {d.conductor}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">{d.destino}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">${(v.amount_paid || 0).toLocaleString('es-CO')}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${v.status === 'active' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>{v.status === 'active' ? 'Adentro' : 'Salió'}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{v.check_in_at ? new Date(v.check_in_at).toLocaleTimeString('es-CO') : '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{v.check_out_at ? new Date(v.check_out_at).toLocaleTimeString('es-CO') : '-'}</td>
                  </tr>
                 );
               })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}