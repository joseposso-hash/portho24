'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function ResidentePage() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [tab, setTab] = useState<'paquetes' | 'visitas' | 'reservas' | 'pqrs' | 'muro'>('paquetes');
  
  const [miUnidad, setMiUnidad] = useState<any>(null);
  const [nombreResidente, setNombreResidente] = useState('');
  
  // Estados para Visitas
  const [nombreVisita, setNombreVisita] = useState('');
  const [docVisita, setDocVisita] = useState('');
  const [qrGenerado, setQrGenerado] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [misVisitas, setMisVisitas] = useState<any[]>([]);

  // Estados para Reservas
  const [areas, setAreas] = useState<any[]>([]);
  const [misReservas, setMisReservas] = useState<any[]>([]);
  const [reservaForm, setReservaForm] = useState({ areaId: '', date: '', startTime: '', endTime: '', notes: '' });
  const [enviandoReserva, setEnviandoReserva] = useState(false);

  // Estados para PQRS
  const [tipoPQRS, setTipoPQRS] = useState('Queja');
  const [asuntoPQRS, setAsuntoPQRS] = useState('');
  const [descPQRS, setDescPQRS] = useState('');
  const [enviandoPQRS, setEnviandoPQRS] = useState(false);
  const [misPqrs, setMisPqrs] = useState<any[]>([]);

  // Estados para Muro Social
  const [comunicados, setComunicados] = useState<any[]>([]);

  useEffect(() => {
    async function cargarDatos() {
      setLoading(true);
      
      // 1. Obtener el usuario logueado
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // 2. Buscar su perfil y su unidad
      const { data: profile } = await supabase
        .from('users')
        .select('*, units(*, towers(*))')
        .eq('id', user.id)
        .single();

      if (profile && profile.units) {
        setMiUnidad(profile.units);
        setNombreResidente(profile.full_name);

        // 3. Cargar paquetes de SU unidad
        const { data: packs } = await supabase
          .from('packages')
          .select('*')
          .eq('recipient_unit_id', profile.units.id)
          .eq('status', 'received')
          .order('created_at', { ascending: false });

        // 4. Cargar visitas de SU unidad
        const { data: vis } = await supabase
          .from('visits')
          .select('*, visitors(full_name, doc_number)')
          .eq('unit_id', profile.units.id)
          .eq('status', 'authorized')
          .order('created_at', { ascending: false });

        // 5. Cargar áreas y reservas
        const { data: areasData } = await supabase.from('areas_comunes').select('*');
        const { data: reservasData } = await supabase
          .from('reservas')
          .select('*, areas_comunes(name, icon)')
          .eq('unit_id', profile.units.id)
          .order('date', { ascending: true });

        // 6. Cargar PQRS
        const { data: pqrsData } = await supabase
          .from('pqrs')
          .select('*')
          .eq('unit_id', profile.units.id)
          .order('created_at', { ascending: false });

        // 7. Cargar comunicados
        const { data: commData } = await supabase
          .from('comunicados')
          .select('*')
          .order('created_at', { ascending: false });

        if (packs) setPaquetes(packs);
        if (vis) setMisVisitas(vis);
        if (areasData) setAreas(areasData);
        if (reservasData) setMisReservas(reservasData);
        if (pqrsData) setMisPqrs(pqrsData);
        if (commData) setComunicados(commData);
      }
      
      setLoading(false);
    }
    cargarDatos();
  }, [router]);

  async function generarQR(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreVisita || !docVisita || !miUnidad) return;
    setGenerando(true);

    const { data: visitor, error: errVis } = await supabase
      .from('visitors')
      .insert({
        tenant_id: miUnidad.towers.tenant_id,
        full_name: nombreVisita,
        doc_number: docVisita
      })
      .select().single();

    if (errVis) { alert(errVis.message); setGenerando(false); return; }

    const { data: visita, error: errVisita } = await supabase
      .from('visits')
      .insert({
        tenant_id: miUnidad.towers.tenant_id,
        visitor_id: visitor.id,
        host_user_id: (await supabase.auth.getUser()).data.user?.id,
        unit_id: miUnidad.id,
        status: 'authorized',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
      .select().single();

    if (errVisita) { alert(errVisita.message); setGenerando(false); return; }

    setMisVisitas([visita, ...misVisitas]);
    setQrGenerado(visita.id);
    setGenerando(false);
  }

  async function crearReserva(e: React.FormEvent) {
    e.preventDefault();
    if (!miUnidad || !reservaForm.areaId || !reservaForm.date || !reservaForm.startTime) return;
    setEnviandoReserva(true);

    const { error } = await supabase.from('reservas').insert({
      tenant_id: miUnidad.towers.tenant_id,
      area_id: reservaForm.areaId,
      unit_id: miUnidad.id,
      date: reservaForm.date,
      start_time: reservaForm.startTime,
      end_time: reservaForm.endTime,
      notes: reservaForm.notes,
      status: 'pending'
    });

    if (error) {
      alert('Error al reservar: ' + error.message);
    } else {
      alert('✅ Reserva solicitada. La administración la revisará pronto.');
      setReservaForm({ areaId: '', date: '', startTime: '', endTime: '', notes: '' });
      const { data } = await supabase.from('reservas').select('*, areas_comunes(name, icon)').eq('unit_id', miUnidad.id).order('date', { ascending: true });
      if (data) setMisReservas(data);
    }
    setEnviandoReserva(false);
  }

  async function enviarPQRS(e: React.FormEvent) {
    e.preventDefault();
    if (!miUnidad) return;
    setEnviandoPQRS(true);

    const { error } = await supabase.from('pqrs').insert({
      tenant_id: miUnidad.towers.tenant_id,
      unit_id: miUnidad.id,
      type: tipoPQRS,
      subject: asuntoPQRS,
      description: descPQRS,
      status: 'pending'
    });

    if (error) {
      alert('Error al enviar: ' + error.message);
    } else {
      alert('✅ PQRS enviada correctamente.');
      setAsuntoPQRS('');
      setDescPQRS('');
      
      const { data: pqrsData } = await supabase.from('pqrs').select('*').eq('unit_id', miUnidad.id).order('created_at', { ascending: false });
      if (pqrsData) setMisPqrs(pqrsData);
    }
    setEnviandoPQRS(false);
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 font-medium text-slate-500">Cargando App Residente...</div>;
  
  if (!miUnidad) return (
    <div className="min-h-screen bg-slate-50 flex justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center h-fit mt-20">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Unidad no encontrada</h1>
        <p className="text-slate-600 mb-6">No tienes un apartamento asignado. Contacta a la administración.</p>
        <button onClick={() => router.push('/login')} className="bg-[#1E3A5F] text-white px-6 py-2 rounded-lg">Volver al Login</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-2xl relative flex flex-col">
        
        <header className="bg-[#1E3A5F] text-white p-6 rounded-b-3xl shadow-md">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-white/20 rounded-full flex items-center justify-center text-xl">🏠</div>
              <div>
                <p className="text-sm text-blue-200">Hola,</p>
                <h1 className="text-lg font-bold">{nombreResidente}</h1>
                <p className="text-xs text-blue-200">{miUnidad.towers.name} - Casa {miUnidad.code}</p>
              </div>
            </div>
            <button onClick={() => router.push('/login')} className="bg-white/10 px-3 py-1.5 rounded-lg text-xs hover:bg-white/20">Salir</button>
          </div>
          
          <div className="flex gap-1 bg-white/10 p-1 rounded-xl overflow-x-auto">
            <button onClick={() => setTab('paquetes')} className={`flex-1 py-2 px-1 text-[10px] sm:text-[11px] font-medium rounded-lg transition whitespace-nowrap ${tab === 'paquetes' ? 'bg-white text-[#1E3A5F]' : 'text-white'}`}>📦 Paquetes</button>
            <button onClick={() => setTab('visitas')} className={`flex-1 py-2 px-1 text-[10px] sm:text-[11px] font-medium rounded-lg transition whitespace-nowrap ${tab === 'visitas' ? 'bg-white text-[#1E3A5F]' : 'text-white'}`}>👤 Visitas</button>
            <button onClick={() => setTab('reservas')} className={`flex-1 py-2 px-1 text-[10px] sm:text-[11px] font-medium rounded-lg transition whitespace-nowrap ${tab === 'reservas' ? 'bg-white text-[#1E3A5F]' : 'text-white'}`}>🏊 Reservas</button>
            <button onClick={() => setTab('pqrs')} className={`flex-1 py-2 px-1 text-[10px] sm:text-[11px] font-medium rounded-lg transition whitespace-nowrap ${tab === 'pqrs' ? 'bg-white text-[#1E3A5F]' : 'text-white'}`}>📝 PQRS</button>
            <button onClick={() => setTab('muro')} className={`flex-1 py-2 px-1 text-[10px] sm:text-[11px] font-medium rounded-lg transition whitespace-nowrap ${tab === 'muro' ? 'bg-white text-[#1E3A5F]' : 'text-white'}`}>📢 Muro</button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {tab === 'paquetes' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Mis Paquetes</h2>
              {paquetes.length === 0 ? (
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
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-1.5 inline-block">
                        <span className="text-xs font-semibold">PIN: </span>
                        <span className="font-mono font-bold text-sm tracking-wider">{p.pin_hash}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'visitas' && (
            <div>
              {misVisitas.length > 0 && !qrGenerado && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-slate-700 mb-2">Tus visitas pendientes:</h3>
                  {misVisitas.map(v => (
                    <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{(v.visitors as any)?.full_name}</p>
                        <p className="text-xs text-slate-500">{(v.visitors as any)?.doc_number}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setQrGenerado(v.id); setNombreVisita((v.visitors as any)?.full_name || ''); setDocVisita((v.visitors as any)?.doc_number || ''); }} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-medium hover:bg-blue-200">Ver QR</button>
                        <button onClick={async () => { if(confirm('¿Cancelar esta visita?')) { await supabase.from('visits').update({ status: 'denied' }).eq('id', v.id); window.location.reload(); } }} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded font-medium hover:bg-red-200">Cancelar</button>
                      </div>
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
                  <div className="bg-white p-4 rounded-xl inline-block border-2 border-slate-100 shadow-sm">
                    <QRCodeSVG value={qrGenerado} size={180} />
                  </div>
                  <a href={`https://wa.me/?text=¡Hola! Te comparto mi código de acceso: https://portho24.vercel.app/visitante/${qrGenerado}`} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] py-3 font-semibold text-white transition hover:bg-[#128C7E] shadow-md">
                    <span>📲</span> Enviar por WhatsApp
                  </a>
                  <div className="bg-slate-50 rounded-lg p-3 text-left text-sm mt-4">
                    <p><strong>Invitado:</strong> {nombreVisita}</p>
                    <p><strong>Documento:</strong> {docVisita}</p>
                  </div>
                  <button onClick={() => { setQrGenerado(null); setNombreVisita(''); setDocVisita(''); }} className="mt-4 text-sm text-blue-600 font-medium hover:underline">Generar otro QR</button>
                </div>
              )}
            </div>
          )}

          {tab === 'reservas' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Reservar Zona Común</h2>
              
              <form onSubmit={crearReserva} className="space-y-4 bg-white p-4 rounded-xl border border-slate-200">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Área Común</span>
                  <select value={reservaForm.areaId} onChange={(e) => setReservaForm({...reservaForm, areaId: e.target.value})} required className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900">
                    <option value="">Seleccionar área...</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                  </select>
                </label>
                
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Fecha</span>
                  <input type="date" value={reservaForm.date} onChange={(e) => setReservaForm({...reservaForm, date: e.target.value})} required className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Hora Inicio</span>
                    <input type="time" value={reservaForm.startTime} onChange={(e) => setReservaForm({...reservaForm, startTime: e.target.value})} required className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Hora Fin</span>
                    <input type="time" value={reservaForm.endTime} onChange={(e) => setReservaForm({...reservaForm, endTime: e.target.value})} required className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" />
                  </label>
                </div>

                <button type="submit" disabled={enviandoReserva} className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white mt-2 disabled:opacity-50">
                  {enviandoReserva ? 'Solicitando...' : 'Solicitar Reserva'}
                </button>
              </form>

              <div className="mt-8">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Mis Reservas</h3>
                {misReservas.length === 0 ? (
                  <p className="text-sm text-slate-400">No tienes reservas.</p>
                ) : (
                  misReservas.map(r => (
                    <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 mb-3 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{(r.areas_comunes as any)?.icon} {(r.areas_comunes as any)?.name}</p>
                          <p className="text-xs text-slate-500">{r.date} · {r.start_time} - {r.end_time}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'pending' ? 'bg-amber-100 text-amber-800' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {r.status === 'pending' ? 'Pendiente' : r.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                        </span>
                      </div>
                      {r.admin_notes && (
                        <div className="mt-2 bg-red-50 border border-red-100 p-2 rounded text-xs text-red-700">
                          <strong>Motivo:</strong> {r.admin_notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'pqrs' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Enviar PQRS</h2>
              <form onSubmit={enviarPQRS} className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Tipo de solicitud</span>
                  <select value={tipoPQRS} onChange={(e) => setTipoPQRS(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900">
                    <option value="Peticion">Petición</option>
                    <option value="Queja">Queja</option>
                    <option value="Reclamo">Reclamo</option>
                    <option value="Sugerencia">Sugerencia</option>
                    <option value="Felicitacion">Felicitación</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Asunto</span>
                  <input type="text" value={asuntoPQRS} onChange={(e) => setAsuntoPQRS(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" placeholder="Ej: Ruido en el piso 3" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Descripción</span>
                  <textarea value={descPQRS} onChange={(e) => setDescPQRS(e.target.value)} required rows={4} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" placeholder="Detalla tu solicitud..." />
                </label>
                <button type="submit" disabled={enviandoPQRS} className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white mt-2 disabled:opacity-50">
                  {enviandoPQRS ? 'Enviando...' : 'Enviar PQRS'}
                </button>
              </form>
              
              <div className="mt-8">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Tus solicitudes anteriores:</h3>
                {misPqrs.length === 0 ? <p className="text-sm text-slate-400">No has enviado ninguna solicitud.</p> : 
                 misPqrs.map(p => (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 mb-3 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{p.subject}</p>
                        <p className="text-xs text-slate-500">{p.type} · {new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === 'pending' ? 'bg-amber-100 text-amber-800' : p.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{p.status === 'pending' ? 'Pendiente' : p.status === 'in_progress' ? 'En Proceso' : 'Resuelto'}</span>
                    </div>
                    {p.response && (
                      <div className="mt-3 bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                        <p className="text-xs font-bold text-emerald-800 mb-1">Respuesta de la Administración:</p>
                        <p className="text-sm text-emerald-700">{p.response}</p>
                      </div>
                    )}
                  </div>
                ))
                }
              </div>
            </div>
          )}

          {tab === 'muro' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Comunicados</h2>
              {comunicados.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <span className="text-5xl mb-2 block">📭</span>
                  <p>No hay comunicados.</p>
                </div>
              ) : (
                comunicados.map(c => (
                  <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${c.type === 'alerta' ? 'bg-red-100 text-red-700' : c.type === 'evento' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{c.type}</span>
                      <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-md font-bold text-slate-800">{c.title}</h3>
                    <p className="text-slate-600 text-sm mt-1">{c.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}