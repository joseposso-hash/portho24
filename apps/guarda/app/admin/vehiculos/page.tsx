'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminVehiculos() {
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('parking_sessions')
        .select('*, vehicles(plate)')
        .order('check_in_at', { ascending: false });
      if (data) setVehiculos(data);
      setLoading(false);
    }
    cargar();
  }, []);

  const filtrados = vehiculos.filter(v => 
    (v.vehicles as any)?.plate?.toLowerCase().includes(busqueda.toLowerCase()) || 
    v.notes?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Historial de Vehículos</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <input 
          type="text" 
          placeholder="Buscar por placa o conductor..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 mb-6 focus:border-[#1E3A5F] focus:outline-none"
        />

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-6 py-4">Placa</th>
                <th className="px-6 py-4">Conductor / Destino</th>
                <th className="px-6 py-4">Cobro</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Ingreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={5} className="p-8 text-center">Cargando...</td></tr> : 
               filtrados.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-bold text-slate-800">{(v.vehicles as any)?.plate}</td>
                  <td className="px-6 py-3 text-xs">{v.notes || '-'}</td>
                  <td className="px-6 py-3 font-medium text-emerald-600">${(v.amount_paid || 0).toLocaleString('es-CO')}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${v.status === 'active' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>
                      {v.status === 'active' ? 'Adentro' : 'Salió'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs">{new Date(v.check_in_at).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}