'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminComunicados() {
  const [comunicados, setComunicados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('info');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
      
      if (profile) {
        setTenantId(profile.tenant_id);
        cargarComunicados(profile.tenant_id);
      }
    }
    init();
  }, []);

  async function cargarComunicados(tId: string) {
    setLoading(true);
    const { data } = await supabase.from('comunicados').select('*').eq('tenant_id', tId).order('created_at', { ascending: false });
    if (data) setComunicados(data);
    setLoading(false);
  }

  async function crearComunicado(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setGuardando(true);

    await supabase.from('comunicados').insert({
      tenant_id: tenantId,
      title, content, type
    });

    setTitle(''); setContent(''); setType('info');
    setGuardando(false);
    cargarComunicados(tenantId);
  }

  async function eliminar(id: string) {
    if(confirm('¿Seguro que deseas eliminar este comunicado?')) {
      await supabase.from('comunicados').delete().eq('id', id);
      if (tenantId) cargarComunicados(tenantId);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Muro Social</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-1/3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 sticky top-24">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Nuevo Comunicado</h2>
            <form onSubmit={crearComunicado} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tipo</span>
                <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900">
                  <option value="info">Información General</option>
                  <option value="alerta">Alerta / Urgente</option>
                  <option value="evento">Evento / Reunión</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Título</span>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" placeholder="Ej: Corte de agua" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Mensaje</span>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={4} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" placeholder="Escribe el mensaje aquí..." />
              </label>

              <button type="submit" disabled={guardando} className="w-full bg-[#1E3A5F] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#152945] disabled:opacity-50">
                {guardando ? 'Publicando...' : 'Publicar Comunicado'}
              </button>
            </form>
          </div>
        </div>

        <div className="w-full md:w-2/3 space-y-4">
          {loading ? (
            <p className="text-center text-slate-400 py-10">Cargando...</p>
          ) : comunicados.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 relative group">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                  c.type === 'alerta' ? 'bg-red-100 text-red-700' :
                  c.type === 'evento' ? 'bg-purple-100 text-purple-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {c.type}
                </span>
                <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800">{c.title}</h3>
              <p className="text-slate-600 text-sm mt-1">{c.content}</p>
              
              <button onClick={() => eliminar(c.id)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}