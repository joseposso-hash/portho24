'use client';

import Link from 'next/link';
import { getHouseNumber } from '../lib/house-number';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

import EvidenceImage from '../components/EvidenceImage';
type IconName =
  | 'package' | 'mail' | 'users' | 'car' | 'parking'
  | 'calendar' | 'clipboard' | 'megaphone' | 'user'
  | 'chart' | 'arrow' | 'home';

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
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

  const paths: Record<IconName, React.ReactNode> = {
    package: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v9" /><path d="m3 8v9l9 5 9-5V8" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    car: <><path d="m5 17-1 3" /><path d="m19 17 1 3" /><path d="M5 17h14l1-7H4l1 7Z" /><path d="m6 10 2-5h8l2 5" /><path d="M7 14h.01M17 14h.01" /><path d="M4 13H2m20 0h-2" /></>,
    parking: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M9 17V7h4a3 3 0 0 1 0 6H9" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m9 15 2 2 4-4" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
    megaphone: <><path d="m3 11 18-5v12L3 13v-2Z" /><path d="m7 14 2 7h4l-2-6" /><path d="M21 10v4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m8 14 4-4 4 3 5-7" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1V10Z" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const grupos = [
  {
    titulo: 'Operación de portería',
    descripcion: 'Control diario de ingresos, entregas y vehículos.',
    items: [
      { nombre: 'Paquetería', detalle: 'Recepción y entrega de paquetes', href: '/admin/paquetes', icon: 'package' as const, color: 'amber' },
      { nombre: 'Correspondencia', detalle: 'Documentos y correspondencia recibida', href: '/admin/correspondencia', icon: 'mail' as const, color: 'blue' },
      { nombre: 'Visitas', detalle: 'Registro y seguimiento de visitantes', href: '/admin/visitas', icon: 'users' as const, color: 'violet' },
      { nombre: 'Vehículos', detalle: 'Directorio y control de vehículos', href: '/admin/vehiculos', icon: 'car' as const, color: 'cyan' },
      { nombre: 'Parqueadero', detalle: 'Sesiones, pagos y autorizaciones', href: '/admin/parqueadero', icon: 'parking' as const, color: 'emerald' },
    ],
  },
  {
    titulo: 'Comunidad y convivencia',
    descripcion: 'Servicios, solicitudes y comunicación con residentes.',
    items: [
      { nombre: 'Residentes', detalle: 'Directorio de casas y residentes', href: '/admin/directorio', icon: 'users' as const, color: 'blue' },
      { nombre: 'Reservas', detalle: 'Administración de áreas comunes', href: '/admin/reservas', icon: 'calendar' as const, color: 'violet' },
      { nombre: 'PQRS', detalle: 'Solicitudes y seguimiento', href: '/admin/pqrs', icon: 'clipboard' as const, color: 'rose' },
      { nombre: 'Comunicados', detalle: 'Novedades e información del conjunto', href: '/admin/comunicados', icon: 'megaphone' as const, color: 'amber' },
    ],
  },
  {
    titulo: 'Administración y control',
    descripcion: 'Gestión de accesos y seguimiento de la operación.',
    items: [
      { nombre: 'Usuarios', detalle: 'Cuentas, perfiles y permisos', href: '/admin/usuarios', icon: 'user' as const, color: 'indigo' },
      { nombre: 'Reportes', detalle: 'Indicadores y registros de gestión', href: '/admin/reportes', icon: 'chart' as const, color: 'slate' },
    ],
  },
];

const colores: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-700 group-hover:bg-amber-100',
  blue: 'bg-blue-50 text-blue-700 group-hover:bg-blue-100',
  violet: 'bg-violet-50 text-violet-700 group-hover:bg-violet-100',
  cyan: 'bg-cyan-50 text-cyan-700 group-hover:bg-cyan-100',
  emerald: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100',
  rose: 'bg-rose-50 text-rose-700 group-hover:bg-rose-100',
  indigo: 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100',
  slate: 'bg-slate-100 text-slate-700 group-hover:bg-slate-200',
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    paquetesPendientes: 0,
    visitasActivas: 0,
    vehiculosActivos: 0,
    autorizacionesPendientes: 0,
  });
  const [ultimosPaquetes, setUltimosPaquetes] = useState<any[]>([]);
  const [visitasActivas, setVisitasActivas] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    async function cargarDatos() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.tenant_id) return;
        const tenantId = profile.tenant_id;

        const [packResult, visitResult, parkingResult, authorizationResult] = await Promise.all([
          supabase
            .from('packages')
            .select('id, courier, photo_url, status, created_at, units(code, towers(name))')
            .eq('tenant_id', tenantId)
            .eq('status', 'received')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('visits')
            .select('*, visitors(full_name), units(code, towers(name))')
            .eq('tenant_id', tenantId)
            .eq('status', 'checked_in')
            .order('check_in_at', { ascending: false })
            .limit(5),
          supabase
            .from('parking_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'active'),
          supabase
            .from('parking_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('charge_authorization_status', 'pending'),
        ]);

        if (!mounted) return;

        setStats({
          paquetesPendientes: packResult.data?.length || 0,
          visitasActivas: visitResult.data?.length || 0,
          vehiculosActivos: parkingResult.count || 0,
          autorizacionesPendientes: authorizationResult.count || 0,
        });

        setUltimosPaquetes(packResult.data || []);
        setVisitasActivas(visitResult.data || []);
      } catch (error) {
        console.error('Error cargando el panel administrativo:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    cargarDatos();
    return () => { mounted = false; };
  }, []);

  const indicadores = [
    { label: 'Paquetes pendientes', value: stats.paquetesPendientes, icon: 'package' as const, color: 'amber', href: '/admin/paquetes' },
    { label: 'Visitas activas', value: stats.visitasActivas, icon: 'users' as const, color: 'blue', href: '/admin/visitas' },
    { label: 'Vehículos dentro', value: stats.vehiculosActivos, icon: 'car' as const, color: 'emerald', href: '/admin/vehiculos' },
    { label: 'Autorizaciones pendientes', value: stats.autorizacionesPendientes, icon: 'parking' as const, color: 'violet', href: '/admin/parqueadero' },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Portho24 · Administración</p>
          <h1 className="text-lg font-bold text-slate-800">Panel principal</h1>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 sm:flex">
          <Icon name="home" size={16} />
          Pinar de la Fontana E3
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 p-5 md:p-8">
        <section>
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900">Resumen de operación</h2>
            <p className="mt-1 text-sm text-slate-500">Indicadores de actividad de tu conjunto.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {indicadores.map((item) => (
              <Link key={item.label} href={item.href} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colores[item.color]}`}>
                  <Icon name={item.icon} size={23} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : item.value}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {grupos.map((grupo) => (
          <section key={grupo.titulo}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">{grupo.titulo}</h2>
              <p className="mt-1 text-sm text-slate-500">{grupo.descripcion}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {grupo.items.map((item) => (
                <Link key={item.href} href={item.href} className="group flex min-h-28 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${colores[item.color]}`}>
                    <Icon name={item.icon} size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-800">{item.nombre}</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{item.detalle}</p>
                  </div>
                  <span className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-500">
                    <Icon name="arrow" size={19} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-800">Últimos paquetes recibidos</h2>
              <p className="mt-1 text-xs text-slate-500">Entregas registradas en portería</p>
            </div>
            <div className="divide-y divide-slate-100">
              {loading ? <p className="p-5 text-center text-sm text-slate-400">Cargando información...</p> :
                ultimosPaquetes.length === 0 ? <p className="p-5 text-center text-sm text-slate-400">No hay paquetes pendientes.</p> :
                ultimosPaquetes.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-4">
                    {p.photo_url ? <EvidenceImage src={p.photo_url} alt="Paquete recibido" className="h-11 w-11 rounded-lg object-cover" /> :
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Icon name="package" /></div>}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{p.courier || 'Paquete recibido'}</p>
                      <p className="text-xs text-slate-500">{(p.units as any)?.towers?.name} · Casa {getHouseNumber((p.units as any)?.code)}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-800">Visitas dentro del conjunto</h2>
              <p className="mt-1 text-xs text-slate-500">Visitantes con ingreso registrado</p>
            </div>
            <div className="divide-y divide-slate-100">
              {loading ? <p className="p-5 text-center text-sm text-slate-400">Cargando información...</p> :
                visitasActivas.length === 0 ? <p className="p-5 text-center text-sm text-slate-400">No hay visitas activas.</p> :
                visitasActivas.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 p-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700"><Icon name="user" /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{(v.visitors as any)?.full_name || 'Visitante'}</p>
                      <p className="text-xs text-slate-500">Visita a: {(v.units as any)?.towers?.name} · Casa {getHouseNumber((v.units as any)?.code)}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}