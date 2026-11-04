'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminPaquetes() {
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('packages')
        .select('*, units(code, towers(name))')
        .order('created_at', { ascending: false });
      if (data) setPaquetes(data);
      setLoading(false);
    }
    cargar();
  }, []);

  const filtrados = paquetes.filter(p => 
    p.courier?.toLowerCase().includes(busqueda.toLowerCase()) || 
    p.tracking_number?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.pin_hash?.includes(busqueda)
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Historial de Paquetería</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <input 
          type="text" 
          placeholder="Buscar por courier, guía o PIN..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 mb-6 focus:border-[#1E3A5F] focus:outline-none"
        />

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-6 py-4">Foto</th>
                <th className="px-6 py-4">Courier / Guía</th>
                <th className="px-6 py-4">Destino</th>
                <th className="px-6 py-4">PIN</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="p-8 text-center">Cargando...</td></tr> : 
               filtrados.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3"><img src={p.photo_url} className="h-10 w-10 object-cover rounded-lg" /></td>
                  <td className="px-6 py-3 font-medium">{p.courier}<br/><span className="text-xs text-slate-400">{p.tracking_number}</span></td>
                  <td className="px-6 py-3 text-xs">{(p.units as any)?.towers?.name} - {(p.units as any)?.code}</td>
                  <td className="px-6 py-3 font-mono font-bold text-amber-600">{p.pin_hash}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === 'received' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {p.status === 'received' ? 'Pendiente' : 'Entregado'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs">{new Date(p.created_at).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}