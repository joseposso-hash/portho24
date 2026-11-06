'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminReportes() {
  const [filtroFecha, setFiltroFecha] = useState<'hoy' | 'semana' | 'mes'>('hoy');
  const [filtroModulo, setFiltroModulo] = useState<'todos' | 'paquetes' | 'visitas' | 'vehiculos' | 'pqrs'>('todos');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    paquetes: 0,
    visitas: 0,
    vehiculos: 0,
    recaudo: 0,
    pqrs: 0,
  });

  const [dataExport, setDataExport] = useState<any[]>([]);

  useEffect(() => {
    cargarReportes();
  }, [filtroFecha, filtroModulo]);

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

    const { data: pData } = await supabase.from('packages').select('*').eq('tenant_id', tId).gte('created_at', inicioISO);
    const { data: vData } = await supabase.from('visits').select('*, visitors(full_name)').eq('tenant_id', tId).gte('created_at', inicioISO);
    const { data: cData } = await supabase.from('parking_sessions').select('*, vehicles(plate)').eq('tenant_id', tId).gte('created_at', inicioISO);
    const { data: qData } = await supabase.from('pqrs').select('*').eq('tenant_id', tId).gte('created_at', inicioISO);

    const recaudo = cData?.filter(c => c.status === 'paid').reduce((acc, curr) => acc + (curr.amount_paid || 0), 0) || 0;

    setStats({
      paquetes: pData?.length || 0,
      visitas: vData?.length || 0,
      vehiculos: cData?.length || 0,
      recaudo: recaudo,
      pqrs: qData?.length || 0,
    });

    if (filtroModulo === 'paquetes') setDataExport(pData || []);
    else if (filtroModulo === 'visitas') setDataExport(vData || []);
    else if (filtroModulo === 'vehiculos') setDataExport(cData || []);
    else if (filtroModulo === 'pqrs') setDataExport(qData || []);
    else setDataExport([]);

    setLoading(false);
  }

  function descargarExcel() {
    if (dataExport.length === 0) {
      alert('No hay datos para exportar en este módulo.');
      return;
    }

    // 🔥 CORRECCIÓN DE TIPOS: Especificamos que son arreglos de strings y arreglos de strings
    let headers: string[] = [];
    let rows: string[][] = [];

    if (filtroModulo === 'paquetes') {
      headers = ['Courier', 'Guía', 'Estado', 'Fecha Creación'];
      rows = dataExport.map(d => [d.courier || '', d.tracking_number || '', d.status || '', new Date(d.created_at).toLocaleString()]);
    } else if (filtroModulo === 'visitas') {
      headers = ['Visitante', 'Documento', 'Estado', 'Fecha Ingreso'];
      rows = dataExport.map(d => [d.visitors?.full_name || '', '', d.status || '', d.check_in_at ? new Date(d.check_in_at).toLocaleString() : '']);
    } else if (filtroModulo === 'vehiculos') {
      headers = ['Placa', 'Estado', 'Cobro', 'Fecha Ingreso'];
      rows = dataExport.map(d => [d.vehicles?.plate || '', d.status || '', String(d.amount_paid || 0), d.check_in_at ? new Date(d.check_in_at).toLocaleString() : '']);
    } else if (filtroModulo === 'pqrs') {
      headers = ['Tipo', 'Asunto', 'Estado', 'Fecha'];
      rows = dataExport.map(d => [d.type || '', d.subject || '', d.status || '', new Date(d.created_at).toLocaleString()]);
    }

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_${filtroModulo}_${filtroFecha}.csv`;
    link.click();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Reportes y Estadísticas</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        
        <div className="flex gap-2 mb-6 bg-white p-2 rounded-xl shadow-sm border border-slate-100 w-fit">
          <button onClick={() => setFiltroFecha('hoy')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'hoy' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Hoy</button>
          <button onClick={() => setFiltroFecha('semana')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'semana' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Última Semana</button>
          <button onClick={() => setFiltroFecha('mes')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${filtroFecha === 'mes' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Último Mes</button>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setFiltroModulo('todos')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'todos' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>🌟 Todos</button>
          <button onClick={() => setFiltroModulo('paquetes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'paquetes' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>📦 Paquetería</button>
          <button onClick={() => setFiltroModulo('visitas')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'visitas' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>👤 Visitas</button>
          <button onClick={() => setFiltroModulo('vehiculos')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'vehiculos' ? 'bg-purple-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>🚗 Vehículos</button>
          <button onClick={() => setFiltroModulo('pqrs')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtroModulo === 'pqrs' ? 'bg-rose-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>📝 PQRS</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {(filtroModulo === 'todos' || filtroModulo === 'paquetes') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">Paquetes Recibidos</p>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.paquetes}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'visitas') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">Visitas Registradas</p>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.visitas}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'vehiculos') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">Vehículos Ingresados</p>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.vehiculos}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'vehiculos') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">Recaudo Parqueadero</p>
              <p className="text-4xl font-bold text-emerald-600">{loading ? '-' : `$${stats.recaudo.toLocaleString('es-CO')}`}</p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'pqrs') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">PQRS Recibidas</p>
              <p className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.pqrs}</p>
            </div>
          )}

        </div>

        <div className="mt-8 flex justify-end">
          {filtroModulo !== 'todos' && (
            <button onClick={descargarExcel} className="bg-emerald-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm">
              📥 Descargar Reporte de {filtroModulo.charAt(0).toUpperCase() + filtroModulo.slice(1)} (Excel)
            </button>
          )}
        </div>

      </div>
    </div>
  );
}