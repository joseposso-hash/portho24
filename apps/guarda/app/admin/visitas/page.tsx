'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminVisitas() {
  const [visitas, setVisitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('visits')
        .select('*, visitors(full_name, doc_number), units(code, towers(name))')
        .order('check_in_at', { ascending: false });
      if (data) setVisitas(data);
      setLoading(false);
    }
    cargar();
  }, []);

  const filtrados = visitas.filter(v => 
    (v.visitors as any)?.full_name?.toLowerCase().includes(busqueda.toLowerCase()) || 
    (v.visitors as any)?.doc_number?.includes(busqueda)
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Historial de Visitas</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <input 
          type="text" 
          placeholder="Buscar por nombre o documento..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 mb-6 focus:border-[#1E3A5F] focus:outline-none"
        />

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-6 py-4">Visitante</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Visita a</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={5} className="p-8 text-center">Cargando...</td></tr> : 
               filtrados.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium">{(v.visitors as any)?.full_name}</td>
                  <td className="px-6 py-3">{(v.visitors as any)?.doc_number}</td>
                  <td className="px-6 py-3 text-xs font-medium text-slate-700">
                    {(v.units as any)?.towers?.name} - {(v.units as any)?.code}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      v.status === 'checked_in' ? 'bg-blue-100 text-blue-800' : 
                      v.status === 'authorized' ? 'bg-amber-100 text-amber-800' : 
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {v.status === 'checked_in' ? 'Adentro' : v.status === 'authorized' ? 'Esperando' : 'Salió'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs">
                    {v.check_in_at ? new Date(v.check_in_at).toLocaleString('es-CO') : 'No ingresó'}
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