'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  const menuItems = [
    { name: 'Inicio (Dashboard)', icon: '📊', path: '/admin' },
    { name: 'Paquetería', icon: '📦', path: '/admin/paquetes' },
    { name: 'Visitas', icon: '👤', path: '/admin/visitas' },
    { name: 'Vehículos', icon: '🚗', path: '/admin/vehiculos' },
    { name: 'PQRS (Peticiones)', icon: '📝', path: '/admin/pqrs' },
    { name: 'Directorio', icon: '📖', path: '/admin/directorio' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      
      {/* MENÚ LATERAL */}
      <aside className={`bg-white border-r border-slate-200 shadow-sm transition-all duration-300 flex flex-col ${isOpen ? 'w-64' : 'w-20'}`}>
        
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="min-w-[32px] h-8 bg-[#1E3A5F] rounded-lg flex items-center justify-center text-white text-lg">🛡️</div>
            {isOpen && <span className="font-bold text-[#1E3A5F] text-lg whitespace-nowrap">Portho 24</span>}
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="text-slate-400 hover:text-slate-600">
            ☰
          </button>
        </div>

        {/* Perfil Administrador */}
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
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-indigo-50 text-indigo-700 font-medium' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {isOpen && <span className="text-sm">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer Sidebar */}
        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={() => router.push('/')}
            className="flex items-center gap-3 text-slate-500 hover:text-slate-800 text-sm w-full"
          >
            <span className="text-xl">🚪</span>
            {isOpen && <span>Volver al Guarda</span>}
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {children}
      </main>
      
    </div>
  );
}