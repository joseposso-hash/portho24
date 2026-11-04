'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false); // Cerrado por defecto en celular

  // Efecto para abrir el menú por defecto en pantallas grandes
  useEffect(() => {
    if (window.innerWidth > 768) {
      setIsOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      
      {/* OVERLAY PARA CERRAR EL MENÚ EN CELULAR */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* MENÚ LATERAL */}
      <aside className={`bg-white border-r border-slate-200 shadow-sm transition-all duration-300 flex flex-col 
        fixed md:relative z-50 h-full 
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'}`}>
        
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="min-w-[32px] h-8 bg-[#1E3A5F] rounded-lg flex items-center justify-center text-white text-lg">🛡️</div>
            {isOpen && <span className="font-bold text-[#1E3A5F] text-lg whitespace-nowrap">Portho 24</span>}
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="text-slate-400 hover:text-slate-600 md:hidden">
            ✕
          </button>
        </div>

        {/* Perfil */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="min-w-[40px] h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold">
            AD
          </div>
          {isOpen && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">Admin Portho</p>
              <p className="text-xs text-slate-500 truncate">Administrador</p>
            </div>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <Link href="/admin" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📊</span> {isOpen && <span className="text-sm">Inicio</span>}
          </Link>
          <Link href="/admin/paquetes" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📦</span> {isOpen && <span className="text-sm">Paquetería</span>}
          </Link>
          <Link href="/admin/visitas" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">👤</span> {isOpen && <span className="text-sm">Visitas</span>}
          </Link>
          <Link href="/admin/vehiculos" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">🚗</span> {isOpen && <span className="text-sm">Vehículos</span>}
          </Link>
          <Link href="/admin/directorio" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📖</span> {isOpen && <span className="text-sm">Directorio</span>}
          </Link>
                    <Link href="/admin/reservas" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📅</span> {isOpen && <span className="text-sm">Reservas</span>}
          </Link>
          <Link href="/admin/usuarios" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">👥</span> {isOpen && <span className="text-sm">Residentes</span>}
          </Link>
          <Link href="/admin/pqrs" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📝</span> {isOpen && <span className="text-sm">PQRS</span>}
          </Link>
          <Link href="/admin/comunicados" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📢</span> {isOpen && <span className="text-sm">Muro Social</span>}
          </Link>
          <Link href="/admin/reportes" onClick={() => window.innerWidth < 768 && setIsOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <span className="text-xl">📈</span> {isOpen && <span className="text-sm">Reportes</span>}
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 text-slate-500 hover:text-slate-800 text-sm w-full">
            <span className="text-xl">🚪</span> {isOpen && <span>Salir al Guarda</span>}
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        {/* BARRA SUPERIOR MÓVIL (solo se ve en celular) */}
        <div className="md:hidden bg-white h-16 flex items-center px-4 border-b border-slate-200">
          <button onClick={() => setIsOpen(true)} className="text-2xl text-slate-600 mr-4">
            ☰
          </button>
          <span className="font-bold text-[#1E3A5F]">Portho 24</span>
        </div>

        {/* AQUÍ SE RENDERIZA EL CONTENIDO DE CADA PÁGINA */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      
    </div>
  );
}