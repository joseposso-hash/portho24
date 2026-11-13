'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type MenuIcon =
  | 'home' | 'package' | 'mail' | 'users' | 'car'
  | 'parking' | 'calendar' | 'clipboard' | 'megaphone'
  | 'user' | 'chart' | 'logout' | 'menu' | 'close';

function Icon({ name, size = 20 }: { name: MenuIcon; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  const paths: Record<MenuIcon, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1V10Z" /></>,
    package: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v9M3 8v9l9 5 9-5V8" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    car: <><path d="m5 17-1 3m15-3 1 3M5 17h14l1-7H4l1 7Z" /><path d="m6 10 2-5h8l2 5M7 14h.01M17 14h.01M4 13H2m20 0h-2" /></>,
    parking: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M9 17V7h4a3 3 0 0 1 0 6H9" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
    megaphone: <><path d="m3 11 18-5v12L3 13v-2Z" /><path d="m7 14 2 7h4l-2-6M21 10v4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    chart: <><path d="M3 3v18h18M8 14l4-4 4 3 5-7" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const menuGroups = [
  {
    title: 'Operación de portería',
    items: [
      { label: 'Paquetería', href: '/admin/paquetes', icon: 'package' as const },
      { label: 'Correspondencia', href: '/admin/correspondencia', icon: 'mail' as const },
      { label: 'Visitas', href: '/admin/visitas', icon: 'users' as const },
      { label: 'Vehículos', href: '/admin/vehiculos', icon: 'car' as const },
      { label: 'Parqueadero', href: '/admin/parqueadero', icon: 'parking' as const },
    ],
  },
  {
    title: 'Comunidad y convivencia',
    items: [
      { label: 'Residentes', href: '/admin/directorio', icon: 'users' as const },
      { label: 'Reservas', href: '/admin/reservas', icon: 'calendar' as const },
      { label: 'PQRS', href: '/admin/pqrs', icon: 'clipboard' as const },
      { label: 'Comunicados', href: '/admin/comunicados', icon: 'megaphone' as const },
    ],
  },
  {
    title: 'Administración y control',
    items: [
      { label: 'Usuarios', href: '/admin/usuarios', icon: 'user' as const },
      { label: 'Reportes', href: '/admin/reportes', icon: 'chart' as const },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [nombreAdmin, setNombreAdmin] = useState('Administrador');
  const [nombreConjunto, setNombreConjunto] = useState('Mi Conjunto');

  useEffect(() => {
    async function cargarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {\n        router.replace('/login');\n        return;\n      }

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, tenant_id, role, is_active, tenants(name)')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile || profile.role !== 'admin' || profile.is_active === false) {\n        router.replace(profile?.role === 'resident' ? '/residente' : profile?.role === 'guard' ? '/guarda' : '/login');\n        return;\n      }\n\n      if (profile) {\n        setNombreAdmin(profile.full_name || 'Administrador');
        const tenantData = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants;
        if (tenantData?.name) setNombreConjunto('Pinar de la Fontana E3');
      }
    }
    cargarPerfil();\n  }, [router]);

  useEffect(() => {
    if (window.innerWidth > 768) setIsOpen(true);
  }, []);

  const cerrarEnMovil = () => {
    if (window.innerWidth < 768) setIsOpen(false);
  };

  const enlaceClase = (href: string) => {
    const activo = href === '/admin'
      ? pathname === '/admin'
      : pathname === href || pathname.startsWith(`${href}/`);

    return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
      activo
        ? 'bg-[#1E3A5F] text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {isOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-slate-950/40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-slate-200 bg-white shadow-sm transition-all duration-300 md:sticky md:top-0 ${
        isOpen ? 'w-72 translate-x-0' : '-translate-x-full w-72 md:w-20 md:translate-x-0'
      }`}>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E3A5F] text-white">
              <Icon name="home" size={21} />
            </div>
            {isOpen && <span className="whitespace-nowrap text-lg font-bold text-[#1E3A5F]">Portho24</span>}
          </div>
          <button
            type="button"
            aria-label={isOpen ? 'Cerrar menú' : 'Expandir menú'}
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
          >
            <Icon name="close" size={19} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
            {nombreAdmin.charAt(0).toUpperCase()}
          </div>
          {isOpen && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{nombreAdmin}</p>
              <p className="text-xs text-slate-500">Administrador</p>
              <p className="truncate text-xs text-slate-400">{nombreConjunto}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          <div>
            {isOpen && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">General</p>}
            <Link
              href="/admin"
              title="Inicio"
              onClick={cerrarEnMovil}
              className={enlaceClase('/admin')}
            >
              <Icon name="home" />
              {isOpen && <span>Inicio</span>}
            </Link>
          </div>

          {menuGroups.map((group) => (
            <div key={group.title}>
              {isOpen && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.title}</p>}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    onClick={cerrarEnMovil}
                    className={enlaceClase(item.href)}
                  >
                    <Icon name={item.icon} />
                    {isOpen && <span>{item.label}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            title="Salir al Guarda"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <Icon name="logout" />
            {isOpen && <span>Salir al Guarda</span>}
          </button>
        </div>
      </aside>

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 md:hidden">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setIsOpen(true)}
            className="mr-3 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Icon name="menu" size={22} />
          </button>
          <span className="font-bold text-[#1E3A5F]">Portho24</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}