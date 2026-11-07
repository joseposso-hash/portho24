'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [nombreAdmin, setNombreAdmin] = useState('Administrador');
  const [nombreConjunto, setNombreConjunto] = useState('Mi Conjunto');

  useEffect(() => {
    async function cargarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, tenant_id, tenants(name)')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        setNombreAdmin(profile.full_name || 'Administrador');
        const tenantData = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants;
        if (tenantData?.name) setNombreConjunto('Pinar de la Fontana E3');
      }
    }
    cargarPerfil();
  }, []);

  useEffect(() => {
    if (window.innerWidth > 768) setIsOpen(true);
  }, []);

  const cerrarEnMovil = () => {
    if (window.innerWidth < 768) setIsOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`bg-white border-r border-slate-200 shadow-sm transition-all duration-300 flex flex-col fixed md:relative z-50 h-full ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'}`}>

        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="min-w-[32px] h-8 bg-[#1E3A5F] rounded-lg flex items-center justify-center text-white text-lg">
              {'\u{1F6E1}\uFE0F'}
            </div>
            {isOpen && <span className="font-bold text-[#1E3A5F] text-lg whitespace-nowrap">Portho 24</span>}
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="text-slate-400 hover:text-slate-600 md:hidden">
            {'\u2715'}
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="min-w-[40px] h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold">
            {nombreAdmin.charAt(0).toUpperCase()}
          </div>
          {isOpen && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{nombreAdmin}</p>
              <p className="text-xs text-slate-500 truncate">Administrador</p>
              <p className="text-xs text-slate-400 truncate">{nombreConjunto}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <Link href="/admin" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F4CA}'}</span> {isOpen && <span className="text-sm">Inicio</span>}
          </Link>
          <Link href="/admin/paquetes" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F4E6}'}</span> {isOpen && <span className="text-sm">{'Paqueter\u00EDa'}</span>}
          </Link>
          <Link href="/admin/visitas" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F464}'}</span> {isOpen && <span className="text-sm">Visitas</span>}
          </Link>
          <Link href="/admin/vehiculos" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F697}'}</span> {isOpen && <span className="text-sm">{'Veh\u00EDculos'}</span>}
          </Link>
          <Link href="/admin/directorio" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F4D6}'}</span> {isOpen && <span className="text-sm">Directorio</span>}
          </Link>
          <Link href="/admin/usuarios" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F465}'}</span> {isOpen && <span className="text-sm">Residentes</span>}
          </Link>
          <Link href="/admin/reservas" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F4C5}'}</span> {isOpen && <span className="text-sm">Reservas</span>}
          </Link>
          <Link href="/admin/pqrs" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F4DD}'}</span> {isOpen && <span className="text-sm">PQRS</span>}
          </Link>
          <Link href="/admin/comunicados" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F4E2}'}</span> {isOpen && <span className="text-sm">Muro Social</span>}
          </Link>
          <Link href="/admin/reportes" onClick={cerrarEnMovil} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">{'\u{1F4C8}'}</span> {isOpen && <span className="text-sm">Reportes</span>}
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 text-slate-500 hover:text-slate-800 text-sm w-full">
            <span className="text-xl">{'\u{1F6AA}'}</span> {isOpen && <span>{'Salir al Guarda'}</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        <div className="md:hidden bg-white h-16 flex items-center px-4 border-b border-slate-200">
          <button onClick={() => setIsOpen(true)} className="text-2xl text-slate-600 mr-4">
            {'\u2630'}
          </button>
          <span className="font-bold text-[#1E3A5F]">Portho 24</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

