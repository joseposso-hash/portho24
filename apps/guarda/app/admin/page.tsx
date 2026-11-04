'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    paquetesPendientes: 0,
    visitasActivas: 0,
    vehiculosActivos: 0,
  });
  
  const [ultimosPaquetes, setUltimosPaquetes] = useState<any[]>([]);
  const [visitasActivas, setVisitasActivas] = useState<any[]>([]);

  useEffect(() => {
    async function cargarDatos() {
      // 1. Paquetes pendientes
      const { data: packData } = await supabase
        .from('packages')
        .select('*, units(code, towers(name))')
        .eq('status', 'received')
        .order('created_at', { ascending: false })
        .limit(5);
      
      // 2. Visitas activas
      const { data: visitData } = await supabase
        .from('visits')
        .select('*, visitors(full_name), units(code, towers(name))')
        .eq('status', 'checked_in')
        .order('check_in_at', { ascending: false })
        .limit(5);

      // 3. Vehículos activos
      const { data: parkingData } = await supabase
        .from('parking_sessions')
        .select('id')
        .eq('status', 'active');

      setStats({
        paquetesPendientes: packData?.length || 0,
        visitasActivas: visitData?.length || 0,
        vehiculosActivos: parkingData?.length || 0,
      });

      if (packData) setUltimosPaquetes(packData);
      if (visitData) setVisitasActivas(visitData);
      setLoading(false);
    }
    cargarDatos();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Topbar */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Resumen General</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">Conjunto Los Robles</span>
          <div className="h-8 w-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">AD</div>
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto space-y-8">
        
        {/* Tarjetas de Métricas */}
                {/* Tarjetas de Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl">📦</div>
            <div>
              <p className="text-sm font-medium text-slate-500">Paquetes Pendientes</p>
              <p className="text-3xl font-bold text-slate-800">{stats.paquetesPendientes}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl">👤</div>
            <div>
              <p className="text-sm font-medium text-slate-500">Visitas Activas</p>
              <p className="text-3xl font-bold text-slate-800">{stats.visitasActivas}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">🚗</div>
            <div>
              <p className="text-sm font-medium text-slate-500">Vehículos Adentro</p>
              <p className="text-3xl font-bold text-slate-800">{stats.vehiculosActivos}</p>
            </div>
          </div>
        </div>

        {/* Tablas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Últimos Paquetes */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Últimos paquetes recibidos</h2>
            </div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td className="p-5 text-center text-slate-400">Cargando...</td></tr> : 
                 ultimosPaquetes.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-4 w-12"><img src={p.photo_url} className="h-10 w-10 object-cover rounded-lg" /></td>
                    <td className="p-4">
                      <p className="font-medium text-slate-800">{p.courier}</p>
                      <p className="text-xs text-slate-500">{(p.units as any)?.towers?.name} - {(p.units as any)?.code}</p>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded text-xs">{p.pin_hash}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Visitas Activas */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Visitas dentro del conjunto</h2>
            </div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td className="p-5 text-center text-slate-400">Cargando...</td></tr> : 
                 visitasActivas.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <p className="font-medium text-slate-800">{(v.visitors as any)?.full_name}</p>
                      <p className="text-xs text-slate-500">Visita a: {(v.units as any)?.towers?.name} - {(v.units as any)?.code}</p>
                    </td>
                    <td className="p-4 text-right">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">Adentro</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}