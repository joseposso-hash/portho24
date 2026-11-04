'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminReportes() {
  const [filtroFecha, setFiltroFecha] = useState<'hoy' | 'semana' | 'mes'>('hoy');
  const [filtroModulo, setFiltroModulo] = useState<'todos' | 'paquetes' | 'visitas' | 'vehiculos' | 'pqrs'>('todos');
  
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    paquetes: 0,
    visitas: 0,
    vehiculos: 0,
    recaudo: 0,
    pqrs: 0,
  });

  useEffect(() => {
    cargarReportes();
  }, [filtroFecha]); // Se recarga al cambiar la fecha

  async function cargarReportes() {
    setLoading(true);
    const ahora = new Date();
    let fechaInicioCalculada = new Date();
    let fechaFinCalculada = new Date();
    
    if (fechaInicio && fechaFin) {
      fechaInicioCalculada = new Date(fechaInicio);
      fechaInicioCalculada.setHours(0, 0, 0, 0);
      fechaFinCalculada = new Date(fechaFin);
      fechaFinCalculada.setHours(23, 59, 59, 999);
    } else {
      if (filtroFecha === 'hoy') {
        fechaInicioCalculada.setHours(0, 0, 0, 0);
      } else if (filtroFecha === 'semana') {
        fechaInicioCalculada.setDate(ahora.getDate() - 7);
      } else if (filtroFecha === 'mes') {
        fechaInicioCalculada.setMonth(ahora.getMonth() - 1);
      }
      fechaFinCalculada = ahora;
    }
    
    const inicioISO = fechaInicioCalculada.toISOString();
    const finISO = fechaFinCalculada.toISOString();

    // Consultas a Supabase (se hacen todas, pero solo mostramos las de la pestaña activa)
    const { count: cPaquetes } = await supabase.from('packages').select('*', { count: 'exact', head: true }).gte('created_at', inicioISO).lte('created_at', finISO);
    const { count: cVisitas } = await supabase.from('visits').select('*', { count: 'exact', head: true }).gte('created_at', inicioISO).lte('created_at', finISO);
    const { count: cVehiculos } = await supabase.from('parking_sessions').select('*', { count: 'exact', head: true }).gte('created_at', inicioISO).lte('created_at', finISO);
    const { data: pagos } = await supabase.from('parking_sessions').select('amount_paid').gte('check_out_at', inicioISO).lte('check_out_at', finISO).eq('status', 'paid');
    const { count: cPqrs } = await supabase.from('pqrs').select('*', { count: 'exact', head: true }).gte('created_at', inicioISO).lte('created_at', finISO);

    const totalRecaudo = pagos?.reduce((acc, curr) => acc + (curr.amount_paid || 0), 0) || 0;

    setStats({
      paquetes: cPaquetes || 0,
      visitas: cVisitas || 0,
      vehiculos: cVehiculos || 0,
      recaudo: totalRecaudo,
      pqrs: cPqrs || 0,
    });

    setLoading(false);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Reportes y Estadísticas</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        
        {/* 1. PESTAÑAS DE MÓDULOS */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setFiltroModulo('todos')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'todos' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            🌟 Todos
          </button>
          <button onClick={() => setFiltroModulo('paquetes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'paquetes' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            📦 Paquetería
          </button>
          <button onClick={() => setFiltroModulo('visitas')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'visitas' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            👤 Visitas
          </button>
          <button onClick={() => setFiltroModulo('vehiculos')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'vehiculos' ? 'bg-purple-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            🚗 Vehículos
          </button>
          <button onClick={() => setFiltroModulo('pqrs')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'pqrs' ? 'bg-rose-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            📝 PQRS
          </button>
        </div>

        {/* 2. FILTROS DE FECHA */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-8 flex flex-col lg:flex-row items-center gap-4 justify-between">
          <div className="flex gap-2">
            <button onClick={() => { setFiltroFecha('hoy'); setFechaInicio(''); setFechaFin(''); }} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'hoy' && !fechaInicio ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              Hoy
            </button>
            <button onClick={() => { setFiltroFecha('semana'); setFechaInicio(''); setFechaFin(''); }} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'semana' && !fechaInicio ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              Semana
            </button>
            <button onClick={() => { setFiltroFecha('mes'); setFechaInicio(''); setFechaFin(''); }} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'mes' && !fechaInicio ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              Mes
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none" />
            <span className="text-slate-400 text-sm">hasta</span>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none" />
            <button onClick={cargarReportes} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900">
              Buscar
            </button>
          </div>
        </div>

        {/* 3. TARJETAS DINÁMICAS SEGÚN LA PESTAÑA */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {(filtroModulo === 'todos' || filtroModulo === 'paquetes') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xl">📦</div>
                <p className="text-sm font-medium text-slate-500">Paquetes Recibidos</p>
              </div>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.paquetes}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'visitas') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl">👤</div>
                <p className="text-sm font-medium text-slate-500">Visitas Registradas</p>
              </div>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.visitas}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'vehiculos') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xl">🚗</div>
                <p className="text-sm font-medium text-slate-500">Vehículos Ingresados</p>
              </div>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.vehiculos}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'vehiculos') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">💰</div>
                <p className="text-sm font-medium text-slate-500">Recaudo Parqueadero</p>
              </div>
              <p className="text-4xl font-bold text-emerald-600">{loading ? '-' : `$${stats.recaudo.toLocaleString('es-CO')}`}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'pqrs') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl">📝</div>
                <p className="text-sm font-medium text-slate-500">PQRS Recibidas</p>
              </div>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.pqrs}</p>
            </div>
          )}

        </div>

        {/* BOTÓN DE EXPORTAR */}
        <div className="mt-8 flex justify-end">
          <button 
            onClick={() => alert('En la versión final, esto descarga un archivo Excel con los datos del reporte.')}
            className="bg-slate-800 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-slate-900 transition"
          >
            📥 Exportar Reporte a Excel
          </button>
        </div>

      </div>
    </div>
  );
}