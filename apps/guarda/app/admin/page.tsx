'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [visitas, setVisitas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  
  const [stats, setStats] = useState({
    paquetesPendientes: 0,
    visitasActivas: 0,
    vehiculosActivos: 0,
    recaudoParqueadero: 0,
  });

  useEffect(() => {
    async function cargarDatos() {
      // 1. Paquetes pendientes
      const { data: packData } = await supabase
        .from('packages')
        .select('*')
        .eq('status', 'received')
        .order('created_at', { ascending: false });
      
      // 2. Visitas activas
      const { data: visitData } = await supabase
        .from('visits')
        .select('*, visitors(full_name, doc_number)')
        .eq('status', 'checked_in')
        .order('check_in_at', { ascending: false });

      // 3. Vehículos activos en parqueadero
      const { data: parkingData } = await supabase
        .from('parking_sessions')
        .select('*, vehicles(plate)')
        .eq('status', 'active')
        .order('check_in_at', { ascending: false });

      // 4. Recaudo de parqueadero de hoy
      const hoy = new Date();
      hoy.setHours(0,0,0,0);
      const { data: recaudoData } = await supabase
        .from('parking_sessions')
        .select('amount_paid')
        .eq('status', 'paid')
        .gte('check_out_at', hoy.toISOString());

      if (packData) setPaquetes(packData);
      if (visitData) setVisitas(visitData);
      if (parkingData) setVehiculos(parkingData);

      const totalRecaudo = recaudoData?.reduce((sum, s) => sum + (s.amount_paid || 0), 0) || 0;

      setStats({
        paquetesPendientes: packData?.length || 0,
        visitasActivas: visitData?.length || 0,
        vehiculosActivos: parkingData?.length || 0,
        recaudoParqueadero: totalRecaudo,
      });
      
      setLoading(false);
    }
    cargarDatos();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">🖥️ Portho 24 Central</h1>
          <p className="text-sm text-slate-500">Panel de Control del Administrador</p>
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">
          Ir al Guarda
        </button>
      </header>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl bg-white p-5 shadow-sm border-l-4 border-amber-500">
          <p className="text-sm font-medium text-slate-500">Paquetes Pendientes</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats.paquetesPendientes}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm border-l-4 border-blue-500">
          <p className="text-sm font-medium text-slate-500">Visitas Adentro</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats.visitasActivas}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm border-l-4 border-purple-500">
          <p className="text-sm font-medium text-slate-500">Vehículos en Parqueadero</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats.vehiculosActivos}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm border-l-4 border-emerald-500">
          <p className="text-sm font-medium text-slate-500">Recaudo Hoy</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">${stats.recaudoParqueadero.toLocaleString('es-CO')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tabla de Visitas Activas */}
        <div className="rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800">👤 Visitas dentro del conjunto</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-white text-xs uppercase text-slate-400 border-b">
                <tr>
                  <th className="px-4 py-3">Visitante</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center">Cargando...</td></tr>
                ) : visitas.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No hay visitas activas.</td></tr>
                ) : (
                  visitas.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{v.visitors.full_name}</td>
                      <td className="px-4 py-3">{v.visitors.doc_number}</td>
                      <td className="px-4 py-3 text-xs">
                        {new Date(v.check_in_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabla de Vehículos en Parqueadero */}
        <div className="rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800">🚗 Vehículos en Parqueadero</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-white text-xs uppercase text-slate-400 border-b">
                <tr>
                  <th className="px-4 py-3">Placa</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center">Cargando...</td></tr>
                ) : vehiculos.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No hay vehículos.</td></tr>
                ) : (
                  vehiculos.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-900">{v.vehicles.plate}</td>
                      <td className="px-4 py-3 text-xs">{v.notes || 'Sin detalles'}</td>
                      <td className="px-4 py-3 text-xs">
                        {new Date(v.check_in_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabla de Paquetería Pendiente */}
        <div className="rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col lg:col-span-2">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800">📦 Paquetes Pendientes de Retiro</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-white text-xs uppercase text-slate-400 border-b">
                <tr>
                  <th className="px-4 py-3">Foto</th>
                  <th className="px-4 py-3">Courier</th>
                  <th className="px-4 py-3">Guía</th>
                  <th className="px-4 py-3">PIN</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center">Cargando...</td></tr>
                ) : paquetes.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No hay paquetes pendientes.</td></tr>
                ) : (
                  paquetes.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <img src={p.photo_url} alt="Foto" className="h-8 w-8 object-cover rounded" />
                      </td>
                      <td className="px-4 py-3 font-medium">{p.courier}</td>
                      <td className="px-4 py-3">{p.tracking_number || '-'}</td>
                      <td className="px-4 py-3 font-mono font-bold text-amber-600">{p.pin_hash}</td>
                      <td className="px-4 py-3 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}