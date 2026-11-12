'use client';

import { getHouseNumber } from '../../lib/house-number';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

import EvidenceImage from '../../components/EvidenceImage';
export default function AdminPaquetes() {
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');

  useEffect(() => {
    cargar();
  }, [fechaFiltro]);

  async function cargar() {
    setLoading(true);
    let query = supabase
      .from('packages')
      .select('id, courier, tracking_number, photo_url, status, created_at, picked_up_at, units(code, towers(name))')
      .order('created_at', { ascending: false })
      .limit(100);

    if (fechaFiltro) {
      const inicio = `${fechaFiltro}T00:00:00`;
      const fin = `${fechaFiltro}T23:59:59`;
      query = query.gte('created_at', inicio).lte('created_at', fin);
    }

    const { data } = await query;
    if (data) setPaquetes(data);
    setLoading(false);
  }

  const filtrados = paquetes.filter(p => 
    p.courier?.toLowerCase().includes(busqueda.toLowerCase()) || 
    p.tracking_number?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Historial de Paquetería</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
          <input 
            type="text" 
            placeholder="Buscar por courier o guía..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
          />
          
          {/* FILTRO DE FECHA CORREGIDO */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Filtrar fecha:</span>
            <input 
              type="date" 
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="w-full md:w-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-4 py-4">Foto</th>
                <th className="px-4 py-4">Courier / Guía</th>
                <th className="px-4 py-4">Destino</th>
                
                <th className="px-4 py-4">Recibido</th>
                <th className="px-4 py-4">Entregado</th>
                <th className="px-4 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="p-8 text-center">Cargando...</td></tr> : 
               filtrados.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay paquetes registrados.</td></tr> :
               filtrados.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><EvidenceImage src={p.photo_url} alt="Paquete" className="h-10 w-10 object-cover rounded-lg" /></td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {p.courier}<br/><span className="text-xs font-normal text-slate-500">{p.tracking_number}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">
                    {(p.units as any)?.towers?.name} - {getHouseNumber((p.units as any)?.code)}
                  </td>
                  
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.picked_up_at ? new Date(p.picked_up_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.status === 'received' ? 'bg-amber-100 text-amber-800' :
                      p.status === 'notified' ? 'bg-blue-100 text-blue-800' :
                      p.status === 'picked_up' ? 'bg-emerald-100 text-emerald-800' :
                      p.status === 'returned' ? 'bg-slate-100 text-slate-700' :
                      p.status === 'expired' ? 'bg-red-100 text-red-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {
                        p.status === 'received' ? 'Recibido' :
                        p.status === 'notified' ? 'Notificado' :
                        p.status === 'picked_up' ? 'Entregado' :
                        p.status === 'returned' ? 'Devuelto' :
                        p.status === 'expired' ? 'Vencido' :
                        'Estado desconocido'
                      }
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
