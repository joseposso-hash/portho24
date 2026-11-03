'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function ResidentePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [tab, setTab] = useState<'paquetes' | 'visitas'>('paquetes');
  
  const [nombreVisita, setNombreVisita] = useState('');
  const [docVisita, setDocVisita] = useState('');
  const [qrGenerado, setQrGenerado] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  
  // NUEVO: Estado para el historial de visitas del residente
  const [misVisitas, setMisVisitas] = useState<any[]>([]);

  useEffect(() => {
    async function cargarDatos() {
      const fakeUnitId = '44444444-4444-4444-4444-444444444401';
      
      // 1. Cargar paquetes pendientes
      const { data: packs } = await supabase
        .from('packages').select('*').eq('recipient_unit_id', fakeUnitId).eq('status', 'received').order('created_at', { ascending: false });

      // 2. Cargar visitas pendientes del residente
      const { data: vis } = await supabase
        .from('visits')
        .select('*, visitors(full_name, doc_number)')
        .eq('unit_id', fakeUnitId)
        .eq('status', 'authorized')
        .order('created_at', { ascending: false });

      if (packs) setPaquetes(packs);
      if (vis) setMisVisitas(vis);
      setLoading(false);
    }
    cargarDatos();
  }, []);

  async function generarQR(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreVisita || !docVisita) return;
    setGenerando(true);

    const { data: visitor, error: errVis } = await supabase
      .from('visitors')
      .insert({
        tenant_id: '11111111-1111-1111-1111-111111111111',
        full_name: nombreVisita,
        doc_number: docVisita
      })
      .select().single();

    if (errVis) { alert(errVis.message); setGenerando(false); return; }

    const { data: visita, error: errVisita } = await supabase
      .from('visits')
      .insert({
        tenant_id: '11111111-1111-1111-1111-111111111111',
        visitor_id: visitor.id,
        host_user_id: '31f6292b-6b35-41e4-bea3-11d0e3356fef',
        unit_id: '44444444-4444-4444-4444-444444444401',
        status: 'authorized'
      })
      .select().single();

    if (errVisita) { alert(errVisita.message); setGenerando(false); return; }

    // Actualizar la lista local para que aparezca en la lista de visitas pendientes
    setMisVisitas([visita, ...misVisitas]);
    setQrGenerado(visita.id);
    setGenerando(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-2xl relative flex flex-col">
        
        {/* Header */}
        <header className="bg-[#1E3A5F] text-white p-6 rounded-b-3xl shadow-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-white/20 rounded-full flex items-center justify-center text-xl">
              🏠
            </div>
            <div>
              <p className="text-sm text-blue-200">Bienvenida,</p>
              <h1 className="text-xl font-bold">Ana (Torre A - 101)</h1>
            </div>
          </div>
          
          <div className="flex gap-2 bg-white/10 p-1 rounded-xl">
            <button 
              onClick={() => setTab('paquetes')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${tab === 'paquetes' ? 'bg-white text-[#1E3A5F]' : 'text-white'}`}
            >
              📦 Paquetes
            </button>
            <button 
              onClick={() => setTab('visitas')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${tab === 'visitas' ? 'bg-white text-[#1E3A5F]' : 'text-white'}`}
            >
              👤 Visitas
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 p-6 overflow-y-auto">
          {tab === 'paquetes' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Mis Paquetes</h2>
              {loading ? (
                <p className="text-center text-slate-400 py-10">Cargando...</p>
              ) : paquetes.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <span className="text-5xl mb-2 block">📭</span>
                  <p>No tienes paquetes pendientes.</p>
                </div>
              ) : (
                paquetes.map((p) => (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
                    <img src={p.photo_url} alt="Paquete" className="h-16 w-16 object-cover rounded-xl bg-slate-100" />
                    <div className="flex-1">
                      <p className="font-bold text-slate-800">{p.courier}</p>
                      <p className="text-xs text-slate-500 mb-2">Guía: {p.tracking_number || 'N/A'}</p>
                      
                      {p.status === 'received' ? (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-1.5 inline-block">
                          <span className="text-xs font-semibold">PIN de retiro: </span>
                          <span className="font-mono font-bold text-sm tracking-wider">{p.pin_hash}</span>
                        </div>
                      ) : (
                        <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-medium px-2 py-1 rounded-md">
                          ✅ Entregado
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'visitas' && (
            <div>
              {/* LISTA DE VISITAS PENDIENTES DEL RESIDENTE */}
              {misVisitas.length > 0 && !qrGenerado && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-slate-700 mb-2">Tus visitas pendientes:</h3>
                  {misVisitas.map(v => (
                    <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{(v.visitors as any)?.full_name}</p>
                        <p className="text-xs text-slate-500">{(v.visitors as any)?.doc_number}</p>
                      </div>
                      <button 
                        onClick={() => {
                          setQrGenerado(v.id);
                          setNombreVisita((v.visitors as any)?.full_name);
                          setDocVisita((v.visitors as any)?.doc_number);
                        }}
                        className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-medium hover:bg-blue-200"
                      >
                        Ver QR
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!qrGenerado ? (
                <form onSubmit={generarQR} className="space-y-4">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">Pre-autorizar Visita</h2>
                  
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Nombre del invitado</span>
                    <input type="text" value={nombreVisita} onChange={(e) => setNombreVisita(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" placeholder="Ej: Juan Pérez" />
                  </label>
                  
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Documento de identidad</span>
                    <input type="text" value={docVisita} onChange={(e) => setDocVisita(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" placeholder="Ej: 12345678" />
                  </label>
                  
                  <button type="submit" disabled={generando} className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white mt-4 disabled:opacity-50">
                    {generando ? 'Generando...' : 'Generar Código QR'}
                  </button>
                </form>
              ) : (
                <div className="text-center space-y-4 py-4">
                  <h2 className="text-xl font-bold text-slate-900">¡Tu invitado ya puede entrar!</h2>
                  <p className="text-sm text-slate-500">Muestra este código en la portería</p>
                  
                  <div className="bg-white p-4 rounded-xl inline-block border-2 border-slate-100 shadow-sm">
                    <QRCodeSVG value={qrGenerado} size={180} />
                  </div>

                  <a 
                    href={`https://wa.me/?text=¡Hola! Te comparto mi código de acceso para Portho 24. Muestra este código en la portería: https://portho24.vercel.app/visitante/${qrGenerado}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] py-3 font-semibold text-white transition hover:bg-[#128C7E] shadow-md"
                  >
                    <span>📲</span> Enviar por WhatsApp
                  </a>

                  <div className="bg-slate-50 rounded-lg p-3 text-left text-sm mt-4">
                    <p><strong>Invitado:</strong> {nombreVisita}</p>
                    <p><strong>Documento:</strong> {docVisita}</p>
                  </div>
                  
                  <button onClick={() => { setQrGenerado(null); setNombreVisita(''); setDocVisita(''); }} className="mt-4 text-sm text-blue-600 font-medium hover:underline">
                    Generar otro QR
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="p-4 border-t border-slate-100 text-center">
          <button onClick={() => router.push('/')} className="text-xs text-slate-400 hover:text-[#1E3A5F] font-medium">
            Cerrar sesión (Volver al Guarda)
          </button>
        </footer>
      </div>
    </div>
  );
}