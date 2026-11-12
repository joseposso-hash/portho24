
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type FiltroFecha = 'hoy' | 'semana' | 'mes';
type FiltroModulo = 'todos' | 'paquetes' | 'visitas' | 'vehiculos' | 'pqrs';

type ReportStats = {
  paquetes: number;
  visitas: number;
  vehiculos: number;
  recaudo: number;
  pqrs: number;
};

export default function AdminReportes() {
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('hoy');
  const [filtroModulo, setFiltroModulo] = useState<FiltroModulo>('todos');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [stats, setStats] = useState<ReportStats>({
    paquetes: 0,
    visitas: 0,
    vehiculos: 0,
    recaudo: 0,
    pqrs: 0,
  });

  const [dataExport, setDataExport] = useState<any[]>([]);

  useEffect(() => {
    void cargarReportes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroFecha, filtroModulo]);

  function obtenerFechaInicio(): string {
    const ahora = new Date();
    const inicio = new Date(ahora);

    if (filtroFecha === 'hoy') {
      inicio.setHours(0, 0, 0, 0);
    } else if (filtroFecha === 'semana') {
      inicio.setDate(ahora.getDate() - 7);
    } else {
      inicio.setMonth(ahora.getMonth() - 1);
    }

    return inicio.toISOString();
  }

  async function cargarReportes() {
    setLoading(true);
    setErrorMsg('');

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        setErrorMsg('No se encontró una sesión de usuario activa.');
        setStats({
          paquetes: 0,
          visitas: 0,
          vehiculos: 0,
          recaudo: 0,
          pqrs: 0,
        });
        setDataExport([]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      if (!profile?.tenant_id) {
        throw new Error('El usuario no tiene un conjunto asociado.');
      }

      const tenantId = profile.tenant_id;
      const inicioISO = obtenerFechaInicio();

      const [
        paquetesResult,
        visitasResult,
        sesionesResult,
        pqrsResult,
        pagosResult,
        reversionesResult,
      ] = await Promise.all([
        supabase
          .from('packages')
          .select('id, courier, tracking_number, status, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', inicioISO),

        supabase
          .from('visits')
          .select('*, visitors(full_name)')
          .eq('tenant_id', tenantId)
          .gte('created_at', inicioISO),

        supabase
          .from('parking_sessions')
          .select('*, vehicles(plate)')
          .eq('tenant_id', tenantId)
          .gte('created_at', inicioISO),

        supabase
          .from('pqrs')
          .select('*')
          .eq('tenant_id', tenantId)
          .gte('created_at', inicioISO),

        supabase
          .from('parking_payments')
          .select('amount, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', inicioISO),

        supabase
          .from('parking_payment_reversals')
          .select('amount, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', inicioISO),
      ]);

      const errores = [
        paquetesResult.error,
        visitasResult.error,
        sesionesResult.error,
        pqrsResult.error,
        pagosResult.error,
        reversionesResult.error,
      ].filter(Boolean);

      if (errores.length > 0) {
        throw errores[0];
      }

      const paquetes = paquetesResult.data || [];
      const visitas = visitasResult.data || [];
      const sesiones = sesionesResult.data || [];
      const pqrs = pqrsResult.data || [];
      const pagos = pagosResult.data || [];
      const reversiones = reversionesResult.data || [];

      const totalPagos = pagos.reduce(
        (total, pago) => total + Number(pago.amount || 0),
        0
      );

      const totalReversiones = reversiones.reduce(
        (total, reversa) => total + Number(reversa.amount || 0),
        0
      );

      const recaudoNeto = totalPagos - totalReversiones;

      setStats({
        paquetes: paquetes.length,
        visitas: visitas.length,
        vehiculos: sesiones.length,
        recaudo: recaudoNeto,
        pqrs: pqrs.length,
      });

      if (filtroModulo === 'paquetes') {
        setDataExport(paquetes);
      } else if (filtroModulo === 'visitas') {
        setDataExport(visitas);
      } else if (filtroModulo === 'vehiculos') {
        setDataExport(sesiones);
      } else if (filtroModulo === 'pqrs') {
        setDataExport(pqrs);
      } else {
        setDataExport([]);
      }
    } catch (error: any) {
      console.error('Error cargando reportes:', error);
      setErrorMsg(
        error?.message || 'No fue posible cargar los reportes.'
      );
      setStats({
        paquetes: 0,
        visitas: 0,
        vehiculos: 0,
        recaudo: 0,
        pqrs: 0,
      });
      setDataExport([]);
    } finally {
      setLoading(false);
    }
  }

  function escaparCSV(valor: unknown): string {
    const texto = String(valor ?? '');
    return `"${texto.replace(/"/g, '""')}"`;
  }

  function descargarExcel() {
    if (dataExport.length === 0) {
      alert('No hay datos para exportar en este módulo.');
      return;
    }

    let headers: string[] = [];
    let rows: string[][] = [];

    if (filtroModulo === 'paquetes') {
      headers = ['Courier', 'Guía', 'Estado', 'Fecha Creación'];
      rows = dataExport.map((d) => [
        d.courier || '',
        d.tracking_number || '',
        d.status || '',
        d.created_at ? new Date(d.created_at).toLocaleString('es-CO') : '',
      ]);
    } else if (filtroModulo === 'visitas') {
      headers = ['Visitante', 'Documento', 'Estado', 'Fecha Ingreso'];
      rows = dataExport.map((d) => [
        d.visitors?.full_name || '',
        d.document_number || d.document || '',
        d.status || '',
        d.check_in_at
          ? new Date(d.check_in_at).toLocaleString('es-CO')
          : '',
      ]);
    } else if (filtroModulo === 'vehiculos') {
      headers = [
        'Placa',
        'Estado',
        'Valor Liquidado',
        'Valor Pagado',
        'Saldo',
        'Estado de Pago',
        'Fecha Ingreso',
      ];

      rows = dataExport.map((d) => {
        const liquidado = Number(d.amount_due || 0);
        const pagado = Number(d.amount_paid || 0);

        return [
          d.vehicles?.plate || '',
          d.status || '',
          String(liquidado),
          String(pagado),
          String(Math.max(0, liquidado - pagado)),
          d.payment_status || '',
          d.check_in_at
            ? new Date(d.check_in_at).toLocaleString('es-CO')
            : '',
        ];
      });
    } else if (filtroModulo === 'pqrs') {
      headers = ['Tipo', 'Asunto', 'Estado', 'Fecha'];
      rows = dataExport.map((d) => [
        d.type || '',
        d.subject || '',
        d.status || '',
        d.created_at
          ? new Date(d.created_at).toLocaleString('es-CO')
          : '',
      ]);
    }

    const csvContent = [
      headers.map(escaparCSV).join(';'),
      ...rows.map((fila) => fila.map(escaparCSV).join(';')),
    ].join('\r\n');

    const blob = new Blob(['\uFEFF', csvContent], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `Reporte_${filtroModulo}_${filtroFecha}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">
          Reportes y Estadísticas
        </h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex gap-2 mb-6 bg-white p-2 rounded-xl shadow-sm border border-slate-100 w-fit">
          <button
            onClick={() => setFiltroFecha('hoy')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              filtroFecha === 'hoy'
                ? 'bg-[#1E3A5F] text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Hoy
          </button>

          <button
            onClick={() => setFiltroFecha('semana')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              filtroFecha === 'semana'
                ? 'bg-[#1E3A5F] text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Última Semana
          </button>

          <button
            onClick={() => setFiltroFecha('mes')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              filtroFecha === 'mes'
                ? 'bg-[#1E3A5F] text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Último Mes
          </button>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setFiltroModulo('todos')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtroModulo === 'todos'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            🌟 Todos
          </button>

          <button
            onClick={() => setFiltroModulo('paquetes')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtroModulo === 'paquetes'
                ? 'bg-amber-500 text-white'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            📦 Paquetería
          </button>

          <button
            onClick={() => setFiltroModulo('visitas')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtroModulo === 'visitas'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            👤 Visitas
          </button>

          <button
            onClick={() => setFiltroModulo('vehiculos')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtroModulo === 'vehiculos'
                ? 'bg-purple-500 text-white'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            🚗 Vehículos
          </button>

          <button
            onClick={() => setFiltroModulo('pqrs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filtroModulo === 'pqrs'
                ? 'bg-rose-500 text-white'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            📝 PQRS
          </button>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(filtroModulo === 'todos' || filtroModulo === 'paquetes') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">
                Paquetes Recibidos
              </p>
              <p className="text-4xl font-bold text-slate-800">
                {loading ? '-' : stats.paquetes}
              </p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'visitas') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">
                Visitas Registradas
              </p>
              <p className="text-4xl font-bold text-slate-800">
                {loading ? '-' : stats.visitas}
              </p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'vehiculos') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">
                Vehículos Ingresados
              </p>
              <p className="text-4xl font-bold text-slate-800">
                {loading ? '-' : stats.vehiculos}
              </p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'vehiculos') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">
                Recaudo Neto Parqueadero
              </p>
              <p className="text-4xl font-bold text-emerald-600">
                {loading
                  ? '-'
                  : `$${stats.recaudo.toLocaleString('es-CO')}`}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Pagos registrados menos reversiones del período
              </p>
            </div>
          )}

          {(filtroModulo === 'todos' || filtroModulo === 'pqrs') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-2">
                PQRS Recibidas
              </p>
              <p className="text-4xl font-bold text-slate-800">
                {loading ? '-' : stats.pqrs}
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end">
          {filtroModulo !== 'todos' && (
            <button
              onClick={descargarExcel}
              disabled={loading}
              className="bg-emerald-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              📥 Descargar Reporte de{' '}
              {filtroModulo.charAt(0).toUpperCase() + filtroModulo.slice(1)}{' '}
              (CSV para Excel)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
