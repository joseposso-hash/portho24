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

  // 1. Cargar datos del administrador y del conjunto
  useEffect(() => {
    async function cargarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ðŸ”¥ CORRECCIÃ“N: Usamos .maybeSingle() para evitar el error 406
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, tenant_id, tenants(name)')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        setNombreAdmin(profile.full_name || 'Administrador');
        // Supabase puede devolver el tenant como objeto o arreglo
        const tenantData = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants;
        if (tenantData?.name) {
          setNombreConjunto(tenantData.name);
        }
      }
    }
    cargarPerfil();
  }, []);

  // Efecto para abrir el menÃº por defecto en pantallas grandes
  useEffect(() => {
    if (window.innerWidth > 768) {
      setIsOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      
      {/* OVERLAY PARA CERRAR EL MENÃš EN CELULAR */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* MENÃš LATERAL */}
      <aside className={`bg-white border-r border-slate-200 shadow-sm transition-all duration-300 flex flex-col 
        fixed md:relative z-50 h-full 
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'}`}>
        
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="min-w-[32px] h-8 bg-[#1E3A5F] rounded-lg flex items-center justify-center text-white text-lg">ðŸ›¡ï¸</div>
            {isOpen && <span className="font-bold text-[#1E3A5F] text-lg whitespace-nowrap">Portho 24</span>}
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="text-slate-400 hover:text-slate-600 md:hidden">
            âœ•
          </button>
        </div>

        {/* Perfil (AHORA DINÃMICO) */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="min-w-[40px] h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold">
            {nombreAdmin.charAt(0).toUpperCase()}
          </div>
          {isOpen && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{nombreAdmin}</p>
              <p className="text-xs text-slate-500 truncate">Administrador</p>
            </div>
          )}
        </div>

        {/* NavegaciÃ³n */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <Link href="/admin" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ“Š</span> {isOpen && <span className="text-sm">Inicio</span>}
          </Link>
          <Link href="/admin/paquetes" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ“¦</span> {isOpen && <span className="text-sm">PaqueterÃ­a</span>}
          </Link>
          <Link href="/admin/visitas" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ‘¤</span> {isOpen && <span className="text-sm">Visitas</span>}
          </Link>
          <Link href="/admin/vehiculos" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸš—</span> {isOpen && <span className="text-sm">VehÃ­culos</span>}
          </Link>
          <Link href="/admin/directorio" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ“–</span> {isOpen && <span className="text-sm">Directorio</span>}
          </Link>
          <Link href="/admin/usuarios" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ‘¥</span> {isOpen && <span className="text-sm">Residentes</span>}
          </Link>
          <Link href="/admin/reservas" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📅</span> {isOpen && <span className="text-sm">Reservas</span>}
          </Link>          <Link href="/admin/pqrs" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ“</span> {isOpen && <span className="text-sm">PQRS</span>}
          </Link>
          <Link href="/admin/comunicados" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ“¢</span> {isOpen && <span className="text-sm">Muro Social</span>}
          </Link>
          <Link href="/admin/reportes" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">ðŸ“ˆ</span> {isOpen && <span className="text-sm">Reportes</span>}
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 text-slate-500 hover:text-slate-800 text-sm w-full">
            <span className="text-xl">ðŸšª</span> {isOpen && <span>Salir al Guarda</span>}
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        {/* BARRA SUPERIOR MÃ“VIL */}
        <div className="md:hidden bg-white h-16 flex items-center px-4 border-b border-slate-200">
          <button onClick={() => setIsOpen(true)} className="text-2xl text-slate-600 mr-4">
            â˜°
          </button>
          <span className="font-bold text-[#1E3A5F]">Portho 24</span>
        </div>

        {/* AQUÃ SE RENDERIZA EL CONTENIDO DE CADA PÃGINA */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      
    </div>
  );
}
