'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminPQRS() {
  const [pqrs, setPqrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('all');

  // Estados para el modal de respuesta
  const [pqrsSeleccionada, setPqrsSeleccionada] = useState<any>(null);
  const [respuestaTexto, setRespuestaTexto] = useState('');

  useEffect(() => {
    cargarPQRS();
  }, []);

  async function cargarPQRS() {
    setLoading(true);
    const { data } = await supabase
      .from('pqrs')
      .select('*, units(code, towers(name))')
      .order('created_at', { ascending: false });
    
    if (data) setPqrs(data);
    setLoading(false);
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    await supabase.from('pqrs').update({ status: nuevoEstado }).eq('id', id);
    cargarPQRS();
  }

  async function guardarRespuesta() {
    if (!pqrsSeleccionada || !respuestaTexto) return;
    
    await supabase
      .from('pqrs')
      .update({ 
        response: respuestaTexto,
        status: 'resolved' // Al responder, se marca como resuelto automáticamente
      })
      .eq('id', pqrsSeleccionada.id);
      
    setPqrsSeleccionada(null);
    setRespuestaTexto('');
    cargarPQRS();
  }

  const pqrsFiltrados = filtro === 'all' 
    ? pqrs 
    : pqrs.filter(p => p.status === filtro);

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Gestión de PQRS</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">Conjunto Los Robles</span>
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        
        {/* Filtros */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setFiltro('all')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtro === 'all' ? 'bg-[#1E3A5F] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            Todos
          </button>
          <button onClick={() => setFiltro('pending')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtro === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            Pendientes
          </button>
          <button onClick={() => setFiltro('in_progress')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtro === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            En Proceso
          </button>
          <button onClick={() => setFiltro('resolved')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filtro === 'resolved' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            Resueltos
          </button>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Asunto</th>
                <th className="px-6 py-4">Remitente</th> {/* <-- NUEVA COLUMNA */}
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">Cargando...</td></tr>
              ) : pqrsFiltrados.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No hay PQRS en esta categoría.</td></tr>
              ) : (
                pqrsFiltrados.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-800">{p.type}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{p.subject}</td>
                    
                    {/* NUEVA CELDA CON TORRE Y APTO */}
                    <td className="px-6 py-4 text-xs font-semibold text-[#1E3A5F]">
                      {(p.units as any)?.towers?.name} - {(p.units as any)?.code}
                    </td>

                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate">{p.description}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.status === 'pending' ? 'bg-amber-100 text-amber-800' : 
                        p.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {p.status === 'pending' ? 'Pendiente' : p.status === 'in_progress' ? 'En Proceso' : 'Resuelto'}
                      </span>
                    </td>
                    <td className="px-6 py-4 flex items-center gap-2">
                      <select 
                        value={p.status} 
                        onChange={(e) => cambiarEstado(p.id, e.target.value)}
                        className="text-xs border border-slate-300 rounded p-1.5 bg-white text-slate-700 outline-none"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="in_progress">En Proceso</option>
                        <option value="resolved">Resuelto</option>
                      </select>

                      <button 
                        onClick={() => {
                          setPqrsSeleccionada(p);
                          setRespuestaTexto(p.response || '');
                        }}
                        className="text-xs bg-[#1E3A5F] text-white px-3 py-1.5 rounded hover:bg-[#152945] font-medium"
                      >
                        Responder
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE RESPUESTA */}
      {pqrsSeleccionada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Responder PQRS</h2>
            
            <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <p className="text-sm font-bold text-slate-700">De: {pqrsSeleccionada.type} - {pqrsSeleccionada.subject}</p>
              <p className="text-sm text-slate-600 mt-1">{pqrsSeleccionada.description}</p>
            </div>
            
            <label className="block mb-4">
              <span className="text-sm font-medium text-slate-700">Respuesta de la Administración</span>
              <textarea 
                value={respuestaTexto}
                onChange={(e) => setRespuestaTexto(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                placeholder="Escribe la solución o respuesta al residente..."
              />
            </label>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setPqrsSeleccionada(null)} 
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button 
                onClick={guardarRespuesta} 
                disabled={!respuestaTexto} 
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                Enviar Respuesta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}