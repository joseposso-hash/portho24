'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminDirectorio() {
  const [torres, setTorres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    async function cargarDirectorio() {
      setLoading(true);
      
      // Consultamos las torres y sus apartamentos, junto con los usuarios asignados a cada uno
      const { data, error } = await supabase
        .from('towers')
        .select(`
          id, 
          name,
          units (
            id,
            code,
            floor,
            users ( full_name, email )
          )
        `)
        .order('name');

      if (!error && data) {
        setTorres(data);
      }
      setLoading(false);
    }
    cargarDirectorio();
  }, []);

  // Filtrar por nombre de torre, código de apto o nombre del residente
  const torresFiltradas = torres.map(torre => {
    const unitsFiltradas = torre.units.filter((unit: any) => {
      const matchApto = unit.code.toLowerCase().includes(busqueda.toLowerCase());
      const matchResidente = unit.users?.[0]?.full_name?.toLowerCase().includes(busqueda.toLowerCase());
      return matchApto || matchResidente || busqueda === '';
    });
    return { ...torre, units: unitsFiltradas };
  }).filter(torre => torre.units.length > 0 || busqueda === '');

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Directorio de Unidades</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">Conjunto Los Robles</span>
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        
        {/* Buscador */}
        <div className="mb-6">
          <input 
            type="text" 
            placeholder="Buscar por torre, apartamento o nombre del residente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
          />
        </div>

        {/* Listado por Torres */}
        {loading ? (
          <div className="text-center text-slate-400 py-10">Cargando directorio...</div>
        ) : (
          <div className="space-y-8">
            {torresFiltradas.map(torre => (
              <div key={torre.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-200">
                  <h2 className="text-lg font-bold text-[#1E3A5F]">{torre.name}</h2>
                </div>
                
                <table className="w-full text-left text-sm">
                  <thead className="bg-white text-xs uppercase text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3">Apartamento</th>
                      <th className="px-6 py-3">Piso</th>
                      <th className="px-6 py-3">Residente</th>
                      <th className="px-6 py-3">Contacto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {torre.units.length === 0 ? (
                      <tr><td colSpan={4} className="px-6 py-4 text-center text-slate-400">Sin apartamentos registrados.</td></tr>
                    ) : (
                      torre.units.map((unit: any) => {
                        const residente = unit.users?.[0]; // Tomamos el primer residente asignado
                        return (
                          <tr key={unit.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-800">{unit.code}</td>
                            <td className="px-6 py-4 text-slate-500">{unit.floor || '-'}</td>
                            <td className="px-6 py-4">
                              {residente ? (
                                <span className="font-medium text-slate-700">{residente.full_name}</span>
                              ) : (
                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">Sin residente</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-500 text-xs">
                              {residente?.email || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}