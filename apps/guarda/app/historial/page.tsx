'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function HistorialPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'paquetes' | 'visitas' | 'vehiculos'>('paquetes');
  
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [visitas, setVisitas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);

  useEffect(() => {
    cargarDatos();
  }, [fechaFiltro]);

  async function cargarDatos() {
    setLoading(true);
    
    const inicioDia = fechaFiltro ? `${fechaFiltro}T00:00:00` : null;
    const finDia = fechaFiltro ? `${fechaFiltro}T23:59:59` : null;

    let qPacks = supabase.from('packages').select('*, units(code, towers(name))').order('created_at', { ascending: false }).limit(100);
    let qVisits = supabase.from('visits').select('*, visitors(full_name, doc_number), units(code, towers(name))').order('created_at', { ascending: false }).limit(100);
    let qCars = supabase.from('parking_sessions').select('*, vehicles(plate)').order('created_at', { ascending: false }).limit(100);

    if (inicioDia && finDia) {
      qPacks = qPacks.gte('created_at', inicioDia).lte('created_at', finDia);
      qVisits = qVisits.gte('created_at', inicioDia).lte('created_at', finDia);
      qCars = qCars.gte('created_at', inicioDia).lte('created_at', finDia);
    }

    const [packs, visits, cars] = await Promise.all([qPacks, qVisits, qCars]);

    if (packs.data) setPaquetes(packs.data);
    if (visits.data) setVisitas(visits.data);
    if (cars.data) setVehiculos(cars.data);
    setLoading(false);
  }

  async function regenerarPin(id: string) {
    if (!confirm('¿Regenerar el PIN?')) return;
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    const { error } = await supabase.from('packages').update({ pin_hash: newPin }).eq('id', id);
    if (error) alert('Error: ' + error.message);
    else { alert(`✅ Nuevo PIN: ${newPin}`); cargarDatos(); }
  }

  const paquetesFiltrados = paquetes.filter(p => p.courier?.toLowerCase().includes(busqueda.toLowerCase()) || p.tracking_number?.toLowerCase().includes(busqueda.toLowerCase()));
  const visitasFiltradas = visitas.filter(v => (v.visitors as any)?.full_name?.toLowerCase().includes(busqueda.toLowerCase()) || (v.visitors as any)?.doc_number?.includes(busqueda));
  const vehiculosFiltrados = vehiculos.filter(c => (c.vehicles as any)?.plate?.toLowerCase().includes(busqueda.toLowerCase()));

  // Función para extraer datos limpios de las notas del vehículo
  const getDatosVehiculo = (c: any) => {
    const notes = c.notes || '';
    let conductor = '-';
    let destino = 'No especificado';

    if (notes.includes('Visita:')) {
      // Si es una visita escaneada, las notas dicen: "Visita: Nombre - Destino: ..."
      const matchVisita = notes.match(/Visita:\s*([^-]+)/i);
      if (matchVisita) conductor = matchVisita[1].trim();
      const matchDest = notes.match(/Destino:\s*(.+)/i);
      if (matchDest) destino = matchDest[1].trim();
    } else {
      // Si es manual, las notas dicen: "Conductor: Nombre - Doc: ... - Destino: ..."
      const matchCond = notes.match(/Conductor:\s*([^-]+)/i);
      if (matchCond) conductor = matchCond[1].trim();
      const matchDest = notes.match(/Destino:\s*([^-]+)/i);
      if (matchDest) destino = matchDest[1].trim();
    }

    return { conductor, destino };
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">📚 Historial General</h1><p className="text-sm text-slate-500">Consulta de registros</p></div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50 w-fit">← Volver al inicio</button>
      </header>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
          <button onClick={() => setTab('paquetes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'paquetes' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>📦 Paquetes ({paquetes.length})</button>
          <button onClick={() => setTab('visitas')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'visitas' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>👤 Visitas ({visitas.length})</button>
          <button onClick={() => setTab('vehiculos')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'vehiculos' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>🚗 Vehículos ({vehiculos.length})</button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filtrar fecha:</span>
            <input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none" />
          </div>
          <input type="text" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full sm:w-64 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
        {tab === 'paquetes' && (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b"><tr><th className="px-4 py-3">Foto</th><th className="px-4 py-3">Courier / Guía</th><th className="px-4 py-3">Destino</th><th className="px-4 py-3">PIN</th><th className="px-4 py-3">Recibido</th><th className="px-4 py-3">Entregado</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={8} className="p-6 text-center">Cargando...</td></tr> : 
               paquetesFiltrados.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-slate-400">No hay paquetes registrados.</td></tr> :
               paquetesFiltrados.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2"><img src={p.photo_url} className="h-8 w-8 object-cover rounded" /></td>
                  <td className="px-4 py-2 font-semibold text-slate-900">{p.courier}<br/><span className="text-xs font-normal text-slate-500">{p.tracking_number}</span></td>
                  <td className="px-4 py-2 text-xs font-semibold text-[#1E3A5F]">{(p.units as any)?.towers?.name} - {(p.units as any)?.code}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">••••••</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{p.picked_up_at ? new Date(p.picked_up_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === 'received' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{p.status === 'received' ? 'Pendiente' : 'Entregado'}</span></td>
                  <td className="px-4 py-2">{p.status === 'received' ? <button onClick={() => regenerarPin(p.id)} className="text-xs bg-amber-100 text-amber-800 px-3 py-1.5 rounded hover:bg-amber-200 font-medium">Regenerar PIN</button> : <span className="text-xs text-slate-400">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'visitas' && (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b"><tr><th className="px-4 py-3">Foto</th><th className="px-4 py-3">Visitante</th><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Visita a</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Hora</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="p-6 text-center">Cargando...</td></tr> : 
               visitasFiltradas.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-400">No hay visitas registradas.</td></tr> :
               visitasFiltradas.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">{v.photo_url ? <img src={v.photo_url} className="h-10 w-10 object-cover rounded-full shadow-sm" /> : <div className="h-10 w-10 bg-slate-100 rounded-full border border-slate-200"></div>}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{(v.visitors as any)?.full_name}</td>
                  <td className="px-4 py-3 text-slate-700">{(v.visitors as any)?.doc_number}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">{(v.units as any)?.towers?.name} - {(v.units as any)?.code}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${v.status === 'checked_in' ? 'bg-blue-100 text-blue-800' : v.status === 'authorized' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{v.status === 'checked_in' ? 'Adentro' : v.status === 'authorized' ? 'Esperando' : 'Salió/Cancelada'}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">{v.check_in_at ? new Date(v.check_in_at).toLocaleTimeString('es-CO') : 'Aún no ingresa'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'vehiculos' && (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b"><tr><th className="px-4 py-3">Foto</th><th className="px-4 py-3">Placa</th><th className="px-4 py-3">Conductor</th><th className="px-4 py-3">Destino</th><th className="px-4 py-3">Cobro</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Hora Ingreso</th><th className="px-4 py-3">Hora Salida</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={8} className="p-6 text-center">Cargando...</td></tr> : 
               vehiculosFiltrados.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-slate-400">No hay vehículos registrados.</td></tr> :
               vehiculosFiltrados.map(c => {
                 const d = getDatosVehiculo(c);
                 return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{c.photo_url ? <img src={c.photo_url} className="h-10 w-10 object-cover rounded shadow-sm" /> : <div className="h-10 w-10 bg-slate-100 rounded border border-slate-200"></div>}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{(c.vehicles as any)?.plate}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">{d.conductor}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">{d.destino}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">${(c.amount_paid || 0).toLocaleString('es-CO')}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === 'active' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>{c.status === 'active' ? 'Adentro' : 'Salió'}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.check_in_at ? new Date(c.check_in_at).toLocaleTimeString('es-CO') : '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.check_out_at ? new Date(c.check_out_at).toLocaleTimeString('es-CO') : '-'}</td>
                  </tr>
                 );
               })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}