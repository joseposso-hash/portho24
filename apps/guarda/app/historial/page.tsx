'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function HistorialPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'paquetes' | 'visitas' | 'vehiculos'>('paquetes');
  const [busqueda, setBusqueda] = useState('');

  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [visitas, setVisitas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);

  useEffect(() => {
    async function cargarDatos() {
      setLoading(true);
      const [packs, visits, cars] = await Promise.all([
        supabase.from('packages').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('visits').select('*, visitors(full_name, doc_number), units(code, towers(name))').order('check_in_at', { ascending: false }).limit(100),
        supabase.from('parking_sessions').select('*, vehicles(plate)').order('check_in_at', { ascending: false }).limit(100)
      ]);

      if (packs.data) setPaquetes(packs.data);
      if (visits.data) setVisitas(visits.data);
      if (cars.data) setVehiculos(cars.data);
      setLoading(false);
    }
    cargarDatos();
  }, []);

  async function regenerarPin(id: string) {
    if (!confirm('¿Regenerar el PIN para este paquete? El PIN anterior dejará de funcionar.')) return;

    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    
    const { error } = await supabase
      .from('packages')
      .update({ pin_hash: newPin })
      .eq('id', id);

    if (error) {
      alert('Error al regenerar: ' + error.message);
    } else {
      alert(`✅ Nuevo PIN generado: ${newPin}\n\nDíctalo al residente para que retire su paquete.`);
      window.location.reload();
    }
  }

  const paquetesFiltrados = paquetes.filter(p => 
    p.courier?.toLowerCase().includes(busqueda.toLowerCase()) || 
    p.tracking_number?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const visitasFiltradas = visitas.filter(v => 
    (v.visitors as any)?.full_name?.toLowerCase().includes(busqueda.toLowerCase()) || 
    (v.visitors as any)?.doc_number?.includes(busqueda) ||
    (v.units as any)?.code?.includes(busqueda)
  );

  const vehiculosFiltrados = vehiculos.filter(c => 
    (c.vehicles as any)?.plate?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.notes?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📚 Historial General</h1>
          <p className="text-sm text-slate-500">Consulta de registros y auditoría</p>
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">
          ← Volver al inicio
        </button>
      </header>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
          <button onClick={() => setTab('paquetes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'paquetes' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            📦 Paquetes ({paquetes.length})
          </button>
          <button onClick={() => setTab('visitas')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'visitas' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            👤 Visitas ({visitas.length})
          </button>
          <button onClick={() => setTab('vehiculos')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'vehiculos' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            🚗 Vehículos ({vehiculos.length})
          </button>
        </div>
        
        <input 
          type="text" 
          placeholder="Buscar por nombre, cédula, placa o guía..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full md:w-80 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
        {tab === 'paquetes' && (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-4 py-3">Foto</th>
                <th className="px-4 py-3">Courier / Guía</th>
                <th className="px-4 py-3">PIN</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="p-6 text-center">Cargando...</td></tr> : 
               paquetesFiltrados.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-400">No se encontraron paquetes.</td></tr> :
               paquetesFiltrados.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2"><img src={p.photo_url} className="h-8 w-8 object-cover rounded" /></td>
                  {/* TEXTO RESALTADO */}
                  <td className="px-4 py-2 font-semibold text-slate-900">
                    {p.courier}
                    <br/>
                    <span className="text-xs font-normal text-slate-500">{p.tracking_number}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-400">••••••</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === 'received' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {p.status === 'received' ? 'Pendiente' : 'Entregado'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{new Date(p.created_at).toLocaleString('es-CO')}</td>
                  <td className="px-4 py-2">
                    {p.status === 'received' ? (
                      <button onClick={() => regenerarPin(p.id)} className="text-xs bg-amber-100 text-amber-800 px-3 py-1.5 rounded hover:bg-amber-200 font-medium">
                        Regenerar PIN
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'visitas' && (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-4 py-3">Visitante</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Visita a</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Entrada</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="p-6 text-center">Cargando...</td></tr> : 
               visitasFiltradas.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-400">No se encontraron visitas.</td></tr> :
               visitasFiltradas.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  {/* TEXTO RESALTADO */}
                  <td className="px-4 py-3 font-semibold text-slate-900">{(v.visitors as any)?.full_name}</td>
                  <td className="px-4 py-3 text-slate-700">{(v.visitors as any)?.doc_number}</td>
                  {/* TEXTO RESALTADO */}
                  <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">
                    {(v.units as any)?.towers?.name} - {(v.units as any)?.code}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      v.status === 'checked_in' ? 'bg-blue-100 text-blue-800' : 
                      v.status === 'authorized' ? 'bg-amber-100 text-amber-800' : 
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {v.status === 'checked_in' ? 'Adentro' : 
                       v.status === 'authorized' ? 'Esperando Entrada' : 'Salió / Cancelada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {v.check_in_at ? new Date(v.check_in_at).toLocaleString('es-CO') : 'Aún no ingresa'}
                  </td>
                  <td className="px-4 py-3">
                    {v.status === 'authorized' && (
                      <button 
                        onClick={async () => {
                          if(confirm('¿Seguro que deseas cancelar esta visita?')) {
                            await supabase.from('visits').update({ status: 'denied' }).eq('id', v.id);
                            window.location.reload();
                          }
                        }}
                        className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 font-medium"
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'vehiculos' && (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-4 py-3">Placa</th>
                <th className="px-4 py-3">Conductor / Notas</th>
                <th className="px-4 py-3">Cobro</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={5} className="p-6 text-center">Cargando...</td></tr> : 
               vehiculosFiltrados.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-slate-400">No se encontraron vehículos.</td></tr> :
               vehiculosFiltrados.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  {/* TEXTO RESALTADO */}
                  <td className="px-4 py-3 font-bold text-slate-900">{(c.vehicles as any)?.plate}</td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-700">{c.notes || '-'}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">${(c.amount_paid || 0).toLocaleString('es-CO')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === 'active' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>
                      {c.status === 'active' ? 'Adentro' : 'Salió'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{new Date(c.check_in_at).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}