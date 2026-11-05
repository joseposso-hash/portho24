'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminReportes() {
  const [filtroFecha, setFiltroFecha] = useState<'hoy' | 'semana' | 'mes'>('hoy');
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
  }, [filtroFecha]);

  async function cargarReportes() {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
    if (!profile) return;
    const tId = profile.tenant_id;

    const ahora = new Date();
    let fechaInicioCalculada = new Date();
    
    if (filtroFecha === 'hoy') {
      fechaInicioCalculada.setHours(0, 0, 0, 0);
    } else if (filtroFecha === 'semana') {
      fechaInicioCalculada.setDate(ahora.getDate() - 7);
    } else if (filtroFecha === 'mes') {
      fechaInicioCalculada.setMonth(ahora.getMonth() - 1);
    }
    
    const inicioISO = fechaInicioCalculada.toISOString();

    const { count: cPaquetes } = await supabase.from('packages').select('*', { count: 'exact', head: true }).eq('tenant_id', tId).gte('created_at', inicioISO);
    const { count: cVisitas } = await supabase.from('visits').select('*', { count: 'exact', head: true }).eq('tenant_id', tId).gte('created_at', inicioISO);
    const { count: cVehiculos } = await supabase.from('parking_sessions').select('*', { count: 'exact', head: true }).eq('tenant_id', tId).gte('created_at', inicioISO);
    const { data: pagos } = await supabase.from('parking_sessions').select('amount_paid').eq('tenant_id', tId).gte('check_out_at', inicioISO).eq('status', 'paid');
    const { count: cPqrs } = await supabase.from('pqrs').select('*', { count: 'exact', head: true }).eq('tenant_id', tId).gte('created_at', inicioISO);

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
        <div className="flex gap-2 mb-8 bg-white p-2 rounded-xl shadow-sm border border-slate-100 w-fit">
          <button onClick={() => setFiltroFecha('hoy')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'hoy' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Hoy</button>
          <button onClick={() => setFiltroFecha('semana')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'semana' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Última Semana</button>
          <button onClick={() => setFiltroFecha('mes')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'mes' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Último Mes</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Paquetes Recibidos</p>
            <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.paquetes}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Visitas Registradas</p>
            <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.visitas}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Vehículos Ingresados</p>
            <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.vehiculos}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Recaudo Parqueadero</p>
            <p className="text-4xl font-bold text-emerald-600">{loading ? '-' : `$${stats.recaudo.toLocaleString('es-CO')}`}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">PQRS Recibidas</p>
            <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.pqrs}</p>
          </div>
        </div>
      </div>
    </div>
  );
}