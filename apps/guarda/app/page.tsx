'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from './lib/supabase';

const MODULES = [
  { id: 'lobby',    label: 'Recibir Paquete',  icon: '📦', color: 'bg-emerald-600' },
  { id: 'retiro',   label: 'Entregar Paquete', icon: '✅', color: 'bg-blue-600' },
  { id: 'correspondencia', label: 'Correspondencia', icon: '📄', color: 'bg-cyan-700' },
  { id: 'visitas',  label: 'Crear Visita',     icon: '👤', color: 'bg-indigo-600' },
  { id: 'scan',     label: 'Escanear QR',      icon: '📷', color: 'bg-purple-600' },
  { id: 'parking',  label: 'Vehículos',        icon: '🚗', color: 'bg-amber-600' },
  { id: 'admin',    label: 'Central (Admin)',  icon: '\u{1F5A5}\uFE0F', color: 'bg-slate-800' },
];

export default function GuardaHome() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actividad, setActividad] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setUser(session.user);
        cargarActividad();
      }
    });
  }, [router]);

  async function cargarActividad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
    if (!profile) return;
    const tId = profile.tenant_id;

    const [packs, visits, cars] = await Promise.all([
      supabase.from('packages').select('id, courier, status, created_at').eq('tenant_id', tId).order('created_at', { ascending: false }).limit(3),
      supabase.from('visits').select('id, status, check_in_at, visitors(full_name)').eq('tenant_id', tId).order('check_in_at', { ascending: false }).limit(3),
      supabase.from('parking_sessions').select('id, status, check_in_at, vehicles(plate)').eq('tenant_id', tId).order('check_in_at', { ascending: false }).limit(3)
    ]);

    const eventos: any[] = [];
    packs.data?.forEach(p => eventos.push({ tipo: '📦 Paquete', texto: `${p.courier} (${p.status === 'received' ? 'Recibido' : 'Entregado'})`, fecha: p.created_at }));
    visits.data?.forEach((v: any) => eventos.push({ tipo: '👤 Visita', texto: `${v.visitors?.full_name || 'Visitante'}`, fecha: v.check_in_at }));
    cars.data?.forEach((c: any) => {
  // Intentar extraer el destino de las notas (ej: "Destino: Manzana 1 25")
  let destino = '';
  if (c.notes) {
    const match = c.notes.match(/Destino:\s*(.+)/i);
    if (match) destino = ` → ${match[1]}`;
  }
  eventos.push({ 
    tipo: '🚗 Vehículo', 
    texto: `Placa ${c.vehicles?.plate || 'N/A'}${destino}`, 
    fecha: c.check_in_at 
  });
});

    eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    setActividad(eventos);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500">Cargando Portho 24...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1E3A5F] text-2xl">{"\u{1F6E1}\uFE0F"}</div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Portho 24 Guarda</h1>
            <p className="text-sm text-slate-500">{user?.email} · Turno Activo</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/residente" target="_blank" className="text-xs font-medium text-[#1E3A5F] hover:underline bg-white px-3 py-2 rounded-lg shadow-sm">Ver App Residente ↗</Link>
          <button onClick={handleLogout} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">Salir</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {MODULES.map((m) => (
          <Link href={`/${m.id}`} key={m.id} className={`flex h-28 flex-col items-center justify-center gap-1 rounded-xl ${m.color} text-white shadow-sm transition hover:opacity-90 active:scale-95`}>
            <span className="text-3xl">{m.icon}</span>
            <span className="text-sm font-semibold text-center px-2 leading-tight">{m.label}</span>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-slate-800">🕒 Actividad Reciente</h2>
          </div>
          <Link href="/historial" className="text-xs font-medium text-blue-600 hover:underline bg-blue-50 px-3 py-1.5 rounded-lg">Ver historial completo →</Link>
        </div>
        
        <ul className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
          {actividad.length === 0 ? (
            <li className="p-6 text-center text-slate-400 text-sm">No hay movimientos registrados aún.</li>
          ) : (
            actividad.slice(0, 10).map((evento, index) => (
              <li key={index} className="px-4 py-2 flex items-center justify-between hover:bg-slate-50 transition">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-lg">{evento.tipo.split(' ')[0]}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{evento.tipo.split(' ')[1]}</p>
                    <p className="text-xs text-slate-500">{evento.texto}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {new Date(evento.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}