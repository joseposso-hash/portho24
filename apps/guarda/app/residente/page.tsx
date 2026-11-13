
'use client';

import { getHouseNumber } from '../lib/house-number';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

import EvidenceImage from '../components/EvidenceImage';
const DOCUMENT_LABELS: Record<string, string> = {
  electricity: 'Energía',
  water: 'Agua',
  gas: 'Gas',
  telecommunications: 'Telefonía / Internet',
  television: 'Televisión',
  other: 'Otro documento',
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

// Iconografía SVG del panel principal del residente
type ResidentServiceIconName =
  | 'package'
  | 'mail'
  | 'car'
  | 'users'
  | 'calendar'
  | 'clipboard'
  | 'megaphone';

function ResidentServiceIcon({ name }: { name: ResidentServiceIconName }) {
  const paths: Record<ResidentServiceIconName, string[]> = {
    package: [
      'M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z',
      'M3.5 7.5v9L12 21v-9',
      'M20.5 7.5v9L12 21',
      'M7.75 5.25 16.25 9.75',
      'M12 12v9',
    ],
    mail: [
      'M3 5h18v14H3z',
      'm3 7 9 7 9-7',
    ],
    car: [
      'm5 11 1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11',
      'M3 11h18v7H3z',
      'M5 18v2',
      'M19 18v2',
      'M6 14h.01',
      'M18 14h.01',
    ],
    users: [
      'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
      'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      'M20 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75',
    ],
    calendar: [
      'M4 5h16v16H4z',
      'M8 3v4',
      'M16 3v4',
      'M4 10h16',
      'm9 15 2 2 4-4',
    ],
    clipboard: [
      'M9 4h6',
      'M9 3h6v3H9z',
      'M6 5H4v16h16V5h-2',
      'M8 11h8',
      'M8 15h8',
      'M8 18h5',
    ],
    megaphone: [
      'm3 11 18-5v12L3 13z',
      'M11 14.5 13 21h-4l-2-7',
      'M21 10v4',
    ],
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

export default function ResidentePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [pinsPaquetes, setPinsPaquetes] = useState<Record<string, string>>({});
  const [pinLoading, setPinLoading] = useState(false);
  const [regenerandoPinId, setRegenerandoPinId] = useState<string | null>(null);
  const [pinActionMessage, setPinActionMessage] = useState('');

  const [tab, setTab] = useState<
    'inicio' | 'paquetes' | 'correspondencia' | 'visitas' | 'parqueadero' | 'reservas' | 'pqrs' | 'muro'
  >('inicio');

  const [miUnidad, setMiUnidad] = useState<any>(null);
  const [miTenantId, setMiTenantId] = useState<string | null>(null);
  const [nombreResidente, setNombreResidente] = useState('');

  // Correspondencia y notificaciones
  const [correspondencia, setCorrespondencia] = useState<any[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [marcandoNotificacion, setMarcandoNotificacion] = useState<string | null>(null);
  const [mostrarNotificacionesLeidas, setMostrarNotificacionesLeidas] = useState(false);

  // Visitas
  const [nombreVisita, setNombreVisita] = useState('');
  const [docVisita, setDocVisita] = useState('');
  const [qrGenerado, setQrGenerado] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [misVisitas, setMisVisitas] = useState<any[]>([]);
  const [visitasIngresadas, setVisitasIngresadas] = useState<any[]>([]);
  const [cargosParqueadero, setCargosParqueadero] = useState<any[]>([]);
  const [respondiendoCargo, setRespondiendoCargo] = useState<string | null>(null);

  // Reservas
  const [areas, setAreas] = useState<any[]>([]);
  const [misReservas, setMisReservas] = useState<any[]>([]);
  const [reservaForm, setReservaForm] = useState({
    areaId: '',
    date: '',
    startTime: '',
    endTime: '',
    notes: '',
    paymentMode: '',
  });
  const [enviandoPagoId, setEnviandoPagoId] = useState<string | null>(null);
  const [enviandoReserva, setEnviandoReserva] = useState(false);

  // PQRS
  const [tipoPQRS, setTipoPQRS] = useState('Queja');
  const [asuntoPQRS, setAsuntoPQRS] = useState('');
  const [descPQRS, setDescPQRS] = useState('');
  const [enviandoPQRS, setEnviandoPQRS] = useState(false);
  const [misPqrs, setMisPqrs] = useState<any[]>([]);

  // Muro social
  const [comunicados, setComunicados] = useState<any[]>([]);

  const consultarPinesPaquetes = useCallback(async () => {
    setPinLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sesión vencida.');
      }

      const response = await fetch('/api/paquetes/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'No fue posible consultar los PIN.');
      }

      setPinsPaquetes(result.pins || {});
    } catch (error) {
      console.error('Error consultando PIN:', error);
      setPinsPaquetes({});
    } finally {
      setPinLoading(false);
    }
  }, []);

  const regenerarPinPaquete = useCallback(async (packageId: string) => {
    setRegenerandoPinId(packageId);
    setPinActionMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesion vencida.');

      const response = await fetch('/api/paquetes/regenerar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ packageId }),
        cache: 'no-store',
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No fue posible regenerar el PIN.');

      await consultarPinesPaquetes();
      setPinActionMessage('PIN renovado correctamente.');
    } catch (error) {
      setPinActionMessage(error instanceof Error ? error.message : 'Error al regenerar el PIN.');
    } finally {
      setRegenerandoPinId(null);
    }
  }, [consultarPinesPaquetes]);
  // Carga general de información del residente
  const cargarDatos = useCallback(async (mostrarCarga = false) => {
    if (mostrarCarga) setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('users')
        .select('*, units(*, towers(*, tenants(*)))')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error cargando perfil residente:', error);
        return;
      }

      if (!profile || !profile.units) {
        setMiUnidad(null);
        return;
      }

      const unitId = profile.units.id;
      const tenantId = profile.tenant_id;

      setMiUnidad(profile.units);
      setMiTenantId(tenantId);
      setNombreResidente(profile.full_name);

      const ahoraVisitas = new Date();
      const fechaBogota = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(ahoraVisitas);

      const [anioBogota, mesBogota, diaBogota] = fechaBogota.split('-').map(Number);
      const fechaSiguiente = new Date(Date.UTC(anioBogota, mesBogota - 1, diaBogota + 1));
      const fechaSiguienteBogota = [
        fechaSiguiente.getUTCFullYear(),
        String(fechaSiguiente.getUTCMonth() + 1).padStart(2, '0'),
        String(fechaSiguiente.getUTCDate()).padStart(2, '0'),
      ].join('-');

      const inicioDiaBogota = new Date(`${fechaBogota}T00:00:00-05:00`).toISOString();
      const inicioDiaSiguienteBogota = new Date(`${fechaSiguienteBogota}T00:00:00-05:00`).toISOString();
      const ahoraIso = ahoraVisitas.toISOString();

      const [
        packs,
        vis,
        visIn,
        areasData,
        reservasData,
        pqrsData,
        commData,
        correspondenceData,
        notificationsData,
      ] = await Promise.all([
        supabase
          .from('packages')
          .select('id, courier, tracking_number, photo_url, status, created_at')
          .eq('recipient_unit_id', unitId)
          .in('status', ['received', 'notified'])
          .order('created_at', { ascending: false }),

        supabase
          .from('visits')
          .select('*, visitors(full_name, doc_number)')
          .eq('unit_id', unitId)
          .eq('status', 'authorized')
          .gte('created_at', inicioDiaBogota)
          .lt('created_at', inicioDiaSiguienteBogota)
          .gt('expires_at', ahoraIso)
          .order('created_at', { ascending: false }),

        supabase
          .from('visits')
          .select('*, visitors(full_name, doc_number)')
          .eq('unit_id', unitId)
          .eq('status', 'checked_in')
          .gte('check_in_at', inicioDiaBogota)
          .lt('check_in_at', inicioDiaSiguienteBogota)
          .order('check_in_at', { ascending: false })
          .limit(5),

        supabase.from('areas_comunes').select('*').eq('tenant_id', tenantId).eq('is_active', true),

        supabase
          .from('reservas')
          .select('*, areas_comunes(name, icon), reserva_movimientos_financieros(*)')
          .eq('unit_id', unitId)
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true }),

        supabase
          .from('pqrs')
          .select('*')
          .eq('unit_id', unitId)
          .order('created_at', { ascending: false })
          .limit(3),

        supabase
          .from('comunicados')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('correspondence_items')
          .select(`
            id,
            document_type,
            period,
            observations,
            status,
            received_at,
            delivered_at,
            delivered_to,
            created_at
          `)
          .eq('tenant_id', tenantId)
          .eq('unit_id', unitId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),

        supabase
          .from('resident_notifications')
          .select('id, item_id, notification_type, title, message, read_at, created_at')
          .eq('tenant_id', tenantId)
          .eq('unit_id', unitId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      const parkingChargesData = await supabase
        .from('parking_sessions')
        .select('id, amount_due, amount_paid, check_in_at, check_out_at, payment_status, charge_authorization_status, tariff_snapshot, payer_type')
        .eq('tenant_id', tenantId)
        .eq('unit_id', unitId)
        .eq('payer_user_id', user.id)
        .gt('amount_due', 0)
        .order('check_out_at', { ascending: false })
        .limit(30);

      if (packs.error) console.error('Error cargando paquetes:', packs.error);
      if (vis.error) console.error('Error cargando visitas:', vis.error);
      if (visIn.error) console.error('Error cargando visitas ingresadas:', visIn.error);
      if (areasData.error) console.error('Error cargando áreas:', areasData.error);
      if (reservasData.error) console.error('Error cargando reservas:', reservasData.error);
      if (pqrsData.error) console.error('Error cargando PQRS:', pqrsData.error);
      if (commData.error) console.error('Error cargando comunicados:', commData.error);
      if (correspondenceData.error) console.error('Error cargando correspondencia:', correspondenceData.error);
      if (notificationsData.error) console.error('Error cargando notificaciones:', notificationsData.error);
      if (parkingChargesData.error) console.error('Error cargando cargos de parqueadero:', parkingChargesData.error);

      if (packs.data) {
        setPaquetes(packs.data);

        if (packs.data.length > 0) {
          await consultarPinesPaquetes();
        } else {
          setPinsPaquetes({});
        }
      }

      if (vis.data) setMisVisitas(vis.data);
      if (visIn.data) setVisitasIngresadas(visIn.data);
      if (areasData.data) setAreas(areasData.data);
      if (reservasData.data) setMisReservas(reservasData.data);
      if (pqrsData.data) setMisPqrs(pqrsData.data);
      if (commData.data) setComunicados(commData.data);
      if (correspondenceData.data) setCorrespondencia(correspondenceData.data);
      if (notificationsData.data) setNotificaciones(notificationsData.data);
      if (parkingChargesData.data) setCargosParqueadero(parkingChargesData.data);

    } catch (error) {
      console.error('Error actualizando datos del residente:', error);
    } finally {
      if (mostrarCarga) setLoading(false);
    }
  }, [router, consultarPinesPaquetes]);

  useEffect(() => {
    let activa = true;

    const cargarInicial = async () => {
      if (activa) await cargarDatos(true);
    };

    const actualizarAlVolver = () => {
      if (activa && document.visibilityState === 'visible') {
        void cargarDatos(false);
      }
    };

    void cargarInicial();

    window.addEventListener('focus', actualizarAlVolver);
    document.addEventListener('visibilitychange', actualizarAlVolver);

    return () => {
      activa = false;
      window.removeEventListener('focus', actualizarAlVolver);
      document.removeEventListener('visibilitychange', actualizarAlVolver);
    };
  }, [cargarDatos]);

  // Marcar una notificación como leída
  async function marcarComoLeida(id: string) {
    if (!miTenantId) return;

    setMarcandoNotificacion(id);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase
        .from('resident_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', miTenantId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error marcando notificación:', error);
        alert('No fue posible actualizar la notificación.');
        return;
      }

      setNotificaciones((actuales) =>
        actuales.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
    } finally {
      setMarcandoNotificacion(null);
    }
  }

  async function generarQR(e: React.FormEvent) {
    e.preventDefault();

    if (!nombreVisita || !docVisita || !miUnidad || !miTenantId) return;

    setGenerando(true);

    const visitorId = crypto.randomUUID();

    const { error: errVis } = await supabase
      .from('visitors')
      .insert({
        id: visitorId,
        tenant_id: miTenantId,
        full_name: nombreVisita,
        doc_number: docVisita,
      });

    if (errVis) {
      alert('Error al registrar visitante: ' + errVis.message);
      setGenerando(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      alert('No se encontró la sesión del residente.');
      setGenerando(false);
      return;
    }

    const { data: visita, error: errVisita } = await supabase
      .from('visits')
      .insert({
        tenant_id: miTenantId,
        visitor_id: visitorId,
        host_user_id: user.id,
        unit_id: miUnidad.id,
        status: 'authorized',
        expires_at: (() => {
          const ahora = new Date();
          const fechaHoy = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(ahora);

          const [anio, mes, dia] = fechaHoy.split('-').map(Number);
          const manana = new Date(Date.UTC(anio, mes - 1, dia + 1));

          const fechaManana = [
            manana.getUTCFullYear(),
            String(manana.getUTCMonth() + 1).padStart(2, '0'),
            String(manana.getUTCDate()).padStart(2, '0'),
          ].join('-');

          return new Date(`${fechaManana}T00:00:00-05:00`).toISOString();
        })(),
      })
      .select()
      .single();

    if (errVisita) {
      alert('Visitante registrado, pero hubo un error al crear la visita: ' + errVisita.message);
      setGenerando(false);
      return;
    }

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
      status: 'pending',
      payment_mode: reservaForm.paymentMode || null,
    });

    if (error) {
      alert('Error al reservar: ' + error.message);
    } else {
      alert('Reserva solicitada.');
      setReservaForm({ areaId: '', date: '', startTime: '', endTime: '', notes: '', paymentMode: '' });

      const { data } = await supabase
        .from('reservas')
        .select('*, areas_comunes(name, icon), reserva_movimientos_financieros(*)')
        .eq('unit_id', miUnidad.id)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (data) setMisReservas(data);
    }

    setEnviandoReserva(false);
  }

  async function reportarPago(e: React.FormEvent<HTMLFormElement>, reserva: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const amount = Number(formData.get('amount'));
    const paymentMethod = String(formData.get('payment_method') || '');
    const reference = String(formData.get('reference') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    if (!miUnidad || !miTenantId || !Number.isFinite(amount) || amount <= 0 || !paymentMethod) {
      alert('Verifica el valor y el medio de pago.');
      return;
    }

    setEnviandoPagoId(reserva.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('La sesión expiró. Ingresa nuevamente.');
      setEnviandoPagoId(null);
      return;
    }

    const { error } = await supabase.from('reserva_movimientos_financieros').insert({
      tenant_id: miTenantId,
      reserva_id: reserva.id,
      movement_type: 'payment',
      amount,
      payment_method: paymentMethod,
      reference: reference || null,
      notes: notes || null,
      verification_status: 'pending',
      recorded_by: user.id,
    });

    if (error) {
      alert('No fue posible reportar el pago: ' + error.message);
    } else {
      alert('Pago reportado. Quedó pendiente de validación administrativa.');
      form.reset();
      const { data } = await supabase
        .from('reservas')
        .select('*, areas_comunes(name, icon), reserva_movimientos_financieros(*)')
        .eq('unit_id', miUnidad.id)
        .order('date', { ascending: true });
      if (data) setMisReservas(data);
    }
    setEnviandoPagoId(null);
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
      status: 'pending',
    });

    if (error) {
      alert('Error al enviar: ' + error.message);
    } else {
      alert('PQRS enviada.');
      setAsuntoPQRS('');
      setDescPQRS('');

      const { data } = await supabase
        .from('pqrs')
        .select('*')
        .eq('unit_id', miUnidad.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (data) setMisPqrs(data);
    }

    setEnviandoPQRS(false);
  }

  const documentosPendientes = correspondencia.filter(
    (item) => item.status === 'pending' || item.status === 'pickup_requested'
  );

  const documentosEntregados = correspondencia.filter(
    (item) => item.status === 'delivered'
  );

  const notificacionesNoLeidas = notificaciones.filter((n) => !n.read_at).length;
  const notificacionesLeidas = notificaciones.filter((n) => Boolean(n.read_at));
  const notificacionesVisibles = mostrarNotificacionesLeidas
    ? notificaciones
    : notificaciones.filter((n) => !n.read_at);

  async function responderCargoParqueadero(sessionId: string, aprobado: boolean) {
    setRespondiendoCargo(sessionId);

    try {
      const { error } = await supabase.rpc('respond_parking_charge', {
        p_session_id: sessionId,
        p_approved: aprobado
      });

      if (error) throw error;

      alert(aprobado
        ? 'Autorización aprobada. El pago podrá registrarse en portería.'
        : 'Cargo rechazado. La decisión quedó registrada.');

      await cargarDatos(false);
    } catch (error: any) {
      alert(error.message || 'No fue posible responder la autorización.');
    } finally {
      setRespondiendoCargo(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 font-medium text-slate-500">
        Cargando App Residente...
      </div>
    );
  }

  if (!miUnidad) {
    return (
      <div className="min-h-screen bg-slate-50 flex justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center h-fit mt-20">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Unidad no encontrada</h1>
          <p className="text-slate-600 mb-6">
            No tienes una casa asignada. Contacta a la administración.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="bg-[#1E3A5F] text-white px-6 py-2 rounded-lg"
          >
            Volver al Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-2xl relative flex flex-col">

        <header className="bg-[#1E3A5F] text-white p-6 rounded-b-3xl shadow-md">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-white/20 rounded-full flex items-center justify-center text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="25"
                  height="25"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m3 10 9-7 9 7" />
                  <path d="M5 9v12h14V9" />
                  <path d="M9 21v-6h6v6" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-blue-200">Hola,</p>
                <h1 className="text-lg font-bold">{nombreResidente.split(' ')[0]}</h1>
                <p className="text-xs text-blue-200">
                  {miUnidad.towers.tenants.name} - Casa {getHouseNumber(miUnidad.code)}
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push('/login')}
              className="bg-white/10 px-3 py-1.5 rounded-lg text-xs hover:bg-white/20"
            >
              Salir
            </button>
          </div>

          <div className="mt-2 border-t border-white/15 pt-3">
            <p className="text-xs text-blue-100">
              Tu hogar, tus servicios y la información de tu conjunto en un solo lugar.
            </p>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-6 overflow-y-auto">

          {tab !== 'inicio' && (
            <button
              type="button"
              onClick={() => setTab('inicio')}
              className="mb-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#1E3A5F] shadow-sm hover:bg-slate-50"
            >
              <span aria-hidden="true">←</span>
              Volver al inicio
            </button>
          )}

          {/* INICIO - PANEL PRINCIPAL DEL RESIDENTE */}
          {tab === 'inicio' && (
            <section className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Panel principal
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-800">
                  ¿Qué necesitas hacer?
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Accede rápidamente a los servicios de tu conjunto.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    tab: 'paquetes',
                    icon: 'package',
                    titulo: 'Paquetes',
                    descripcion: 'Paquetes recibidos',
                    badge: paquetes.length,
                    color: 'bg-blue-50 text-blue-800',
                  },
                  {
                    tab: 'correspondencia',
                    icon: 'mail',
                    titulo: 'Correspondencia',
                    descripcion: 'Documentos recibidos',
                    badge: documentosPendientes.length,
                    color: 'bg-amber-50 text-amber-800',
                  },
                  {
                    tab: 'parqueadero',
                    icon: 'car',
                    titulo: 'Parqueadero',
                    descripcion: 'Cargos y autorizaciones',
                    badge: cargosParqueadero.filter(
                      (cargo) => cargo.charge_authorization_status === 'pending'
                    ).length,
                    color: 'bg-emerald-50 text-emerald-800',
                  },
                  {
                    tab: 'visitas',
                    icon: 'users',
                    titulo: 'Visitas',
                    descripcion: 'Registro y seguimiento',
                    badge: misVisitas.length,
                    color: 'bg-violet-50 text-violet-800',
                  },
                  {
                    tab: 'reservas',
                    icon: 'calendar',
                    titulo: 'Reservas',
                    descripcion: 'Áreas comunes',
                    badge: misReservas.filter((r) => r.status === 'pending').length,
                    color: 'bg-cyan-50 text-cyan-800',
                  },
                  {
                    tab: 'pqrs',
                    icon: 'clipboard',
                    titulo: 'PQRS',
                    descripcion: 'Solicitudes y seguimiento',
                    badge: misPqrs.filter(
                      (p) => p.status === 'pending' || p.status === 'in_progress'
                    ).length,
                    color: 'bg-orange-50 text-orange-800',
                  },
                  {
                    tab: 'muro',
                    icon: 'megaphone',
                    titulo: 'Comunicados',
                    descripcion: 'Novedades del conjunto',
                    badge: 0,
                    color: 'bg-indigo-50 text-indigo-800',
                  },
                ].map((item) => (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => setTab(item.tab as typeof tab)}
                    className="relative flex min-h-[142px] flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    {item.badge > 0 && (
                      <span className="absolute right-3 top-3 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                        {item.badge}
                      </span>
                    )}

                    <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold tracking-wide ${item.color}`}>
                      <ResidentServiceIcon name={item.icon as 'package' | 'mail' | 'car' | 'users' | 'calendar' | 'clipboard' | 'megaphone'} />
                    </span>

                    <span className="text-sm font-bold text-slate-800">
                      {item.titulo}
                    </span>
                    <span className="mt-1 text-xs leading-relaxed text-slate-500">
                      {item.descripcion}
                    </span>
                  </button>
                ))}
              </div>

              {(documentosPendientes.length > 0 ||
                cargosParqueadero.some(
                  (cargo) => cargo.charge_authorization_status === 'pending'
                )) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-bold text-amber-900">
                    Tienes asuntos pendientes
                  </h3>

                  {documentosPendientes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTab('correspondencia')}
                      className="mt-2 block text-left text-sm text-amber-900 hover:underline"
                    >
                      • {documentosPendientes.length} documento(s) pendiente(s) de entrega.
                    </button>
                  )}

                  {cargosParqueadero.filter(
                    (cargo) => cargo.charge_authorization_status === 'pending'
                  ).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTab('parqueadero')}
                      className="mt-2 block text-left text-sm font-semibold text-amber-900 hover:underline"
                    >
                      • {cargosParqueadero.filter(
                        (cargo) => cargo.charge_authorization_status === 'pending'
                      ).length} autorización(es) de parqueadero pendiente(s).
                      Revisar ahora.
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => void cargarDatos(false)}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Actualizar información
              </button>

              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full rounded-xl py-2 text-sm font-medium text-slate-400 hover:text-red-600"
              >
                Cerrar sesión
              </button>
            </section>
          )}

          {/* PAQUETES */}

          {/* PAQUETES */}
          {tab === 'paquetes' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Mis Paquetes</h2>

              {paquetes.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <span className="text-5xl mb-2 block">✉</span>
                  <p>No tienes paquetes pendientes.</p>
                </div>
              ) : (
                paquetes.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-4"
                  >
                    {p.photo_url && (
                      <EvidenceImage src={p.photo_url} alt="Paquete" className="h-16 w-16 object-cover rounded-xl bg-slate-100" />
                    )}

                    <div className="flex-1">
                      <p className="font-bold text-slate-800">{p.courier}</p>
                      <p className="text-xs text-slate-500 mb-2">
                        Guía: {p.tracking_number || 'N/A'}
                      </p>

                      {pinsPaquetes[p.id] ? (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 inline-block">
                          <span className="text-xs font-semibold">PIN de retiro:</span>
                          <p className="font-mono font-bold text-2xl tracking-widest">
                            {pinsPaquetes[p.id]}
                          </p>
                          <p className="text-[11px] mt-1">
                            Presenta este PIN en vigilancia.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          {pinLoading ? 'Consultando PIN...' : 'PIN no disponible o vencido.'}
                        </p>
                      )}

                      {['received', 'notified'].includes(p.status) && (
                        <button
                          onClick={() => void regenerarPinPaquete(p.id)}
                          disabled={regenerandoPinId !== null || pinLoading}
                          className="mt-3 border border-amber-300 text-amber-800 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                        >
                          {regenerandoPinId === p.id ? 'Regenerando...' : 'Regenerar PIN'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}

              {pinActionMessage && (
                <p className="text-xs text-center text-slate-600">
                  {pinActionMessage}
                </p>
              )}
              <button
                onClick={() => void consultarPinesPaquetes()}
                disabled={pinLoading || paquetes.length === 0}
                className="w-full border border-slate-300 rounded-lg py-2 text-sm text-slate-600 disabled:opacity-40"
              >
                {pinLoading ? 'Consultando...' : 'Consultar PINes'}
              </button>
            </div>
          )}

          {/* CORRESPONDENCIA */}
          {tab === 'correspondencia' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Mi correspondencia</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Consulta los documentos físicos recibidos por la portería para tu casa.
                </p>
              </div>

              {/* Notificaciones */}
                              <section>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-bold text-slate-800">Notificaciones</h3>
                    {notificacionesNoLeidas > 0 && (
                      <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-1 rounded-full">
                        {notificacionesNoLeidas} sin leer
                      </span>
                    )}
                  </div>

                  {notificacionesVisibles.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500">
                      {notificaciones.length === 0
                        ? 'No tienes notificaciones por el momento.'
                        : 'No tienes notificaciones pendientes de lectura.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notificacionesVisibles.map((n) => (
                        <div
                          key={n.id}
                          className={`rounded-xl border p-3 ${
                            n.read_at
                              ? 'bg-white border-slate-200'
                              : 'bg-blue-50 border-blue-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800">
                                {n.title || 'Notificación de correspondencia'}
                              </p>
                              <p className="text-sm text-slate-600 mt-1">
                                {n.message}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-2">
                                {formatDateTime(n.created_at)}
                              </p>
                            </div>

                            {!n.read_at && (
                              <button
                                onClick={() => void marcarComoLeida(n.id)}
                                disabled={marcandoNotificacion === n.id}
                                className="shrink-0 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
                              >
                                {marcandoNotificacion === n.id ? 'Guardando...' : 'Marcar leída'}
                              </button>
                            )}

                            {n.read_at && (
                              <span className="shrink-0 text-[10px] text-emerald-700 font-medium">
                                Leída
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {notificacionesLeidas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMostrarNotificacionesLeidas((actual) => !actual)}
                      className="mt-3 text-xs font-semibold text-blue-700 hover:underline"
                    >
                      {mostrarNotificacionesLeidas
                        ? 'Ocultar notificaciones leídas'
                        : `Ver notificaciones leídas (${notificacionesLeidas.length})`}
                    </button>
                  )}
                </section>

              {/* Pendientes */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800">Documentos pendientes</h3>
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full">
                    {documentosPendientes.length}
                  </span>
                </div>

                {documentosPendientes.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-5 text-center">
                    <p className="text-sm text-slate-500">
                      No tienes documentos pendientes de entrega.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documentosPendientes.map((item) => (
                      <div
                        key={item.id}
                        className="bg-amber-50 border border-amber-200 rounded-xl p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-800">
                              {DOCUMENT_LABELS[item.document_type] || 'Documento'}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                              Período: {item.period || 'No especificado'}
                            </p>
                          </div>
                          <span className="text-[10px] font-semibold bg-amber-200 text-amber-900 px-2 py-1 rounded-full">
                            Pendiente
                          </span>
                        </div>

                        {item.observations && (
                          <p className="text-xs text-slate-600 mt-3">
                            {item.observations}
                          </p>
                        )}

                        <p className="text-[11px] text-slate-500 mt-3">
                          Recibido en portería: {formatDateTime(item.received_at)}
                        </p>
                        <p className="text-xs text-slate-600 mt-2">
                          Para retirarlo, solicítalo directamente al guarda en portería.
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              {/* Historial de documentos entregados */}
              <section className="mt-5">
                <details className="group rounded-xl border border-slate-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                    <div>
                      <h3 className="font-bold text-slate-800">
                        Historial de documentos entregados
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Consulta las entregas anteriores cuando lo necesites.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                        {documentosEntregados.length}
                      </span>
                      <span className="text-slate-500 transition-transform group-open:rotate-180">
                        ▼
                      </span>
                    </div>
                  </summary>

                  <div className="space-y-3 border-t border-slate-100 p-4">
                    {documentosEntregados.length === 0 ? (
                      <p className="py-3 text-center text-sm text-slate-500">
                        Todavía no tienes documentos entregados registrados.
                      </p>
                    ) : (
                      documentosEntregados.map((item) => (
                        <article
                          key={item.id}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800">
                                {DOCUMENT_LABELS[item.document_type] || 'Documento'}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Período: {item.period || 'No especificado'}
                              </p>
                            </div>
                            <span className="rounded-full bg-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-900">
                              Entregado
                            </span>
                          </div>

                          <div className="mt-2 space-y-1 text-xs text-slate-600">
                            <p>
                              <strong>Fecha:</strong> {formatDateTime(item.delivered_at)}
                            </p>
                            <p>
                              <strong>Recibió:</strong> {item.delivered_to || 'No registrado'}
                            </p>
                            <p>
                              <strong>Ingresó a portería:</strong> {formatDateTime(item.received_at)}
                            </p>
                          </div>

                          {item.observations && (
                            <p className="mt-2 text-xs text-slate-600">
                              {item.observations}
                            </p>
                          )}
                        </article>
                      ))
                    )}
                  </div>
                </details>
              </section>

              <button
                onClick={() => void cargarDatos(false)}
                className="w-full border border-slate-300 rounded-lg py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Actualizar correspondencia
              </button>
            </div>
          )}

          {/* VISITAS */}
          {tab === 'visitas' && (
            <div>
              {visitasIngresadas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-emerald-700 mb-2">
                    Invitados que ya ingresaron:
                  </h3>

                  {visitasIngresadas.map((v) => {
                    const visitorData = Array.isArray(v.visitors) ? v.visitors[0] : v.visitors;

                    return (
                      <div
                        key={v.id}
                        className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2"
                      >
                        <p className="text-sm font-semibold text-emerald-900">
                          {visitorData?.full_name}
                        </p>
                        <p className="text-xs text-emerald-600">
                          Ingresó: {new Date(v.check_in_at).toLocaleTimeString('es-CO')}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {misVisitas.length > 0 && !qrGenerado && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-slate-700 mb-2">
                    Tus visitas pendientes:
                  </h3>

                  {misVisitas.map((v) => {
                    const visitorData = Array.isArray(v.visitors) ? v.visitors[0] : v.visitors;

                    return (
                      <div
                        key={v.id}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2"
                      >
                        <div className="mb-2">
                          <p className="text-sm font-semibold text-slate-800">
                            {visitorData?.full_name || 'Visitante sin nombre'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {visitorData?.doc_number || 'Sin documento'}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setQrGenerado(v.id);
                              setNombreVisita(visitorData?.full_name || '');
                              setDocVisita(visitorData?.doc_number || '');
                            }}
                            className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-medium"
                          >
                            Ver QR
                          </button>

                          <button
                            onClick={async () => {
                              if (confirm('¿Cancelar esta visita?')) {
                                const { error } = await supabase
                                  .from('visits')
                                  .update({ status: 'denied' })
                                  .eq('id', v.id);

                                if (error) {
                                  alert('No fue posible cancelar la visita: ' + error.message);
                                } else {
                                  await cargarDatos(false);
                                }
                              }
                            }}
                            className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded font-medium"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!qrGenerado ? (
                <form onSubmit={generarQR} className="space-y-4">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">
                    Pre-autorizar Visita
                  </h2>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Nombre del invitado
                    </span>
                    <input
                      type="text"
                      value={nombreVisita}
                      onChange={(e) => setNombreVisita(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                      placeholder="Ej: Juan Pérez"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Documento de identidad
                    </span>
                    <input
                      type="text"
                      value={docVisita}
                      onChange={(e) => setDocVisita(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                      placeholder="Ej: 12345678"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={generando}
                    className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white mt-4 disabled:opacity-50"
                  >
                    {generando ? 'Generando...' : 'Generar Código QR'}
                  </button>
                </form>
              ) : (
                <div className="text-center space-y-4 py-4">
                  <h2 className="text-xl font-bold text-slate-900">
                    ¡Tu invitado ya puede entrar!
                  </h2>

                  <div className="bg-white p-4 rounded-xl inline-block border-2 border-slate-100 shadow-sm">
                    <QRCodeSVG value={qrGenerado} size={180} />
                  </div>

                  <a
                    href={`https://wa.me/?text=¡Hola! Te comparto mi código de acceso: https://portho24.vercel.app/visitante/${qrGenerado}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] py-3 font-semibold text-white"
                  >
                    Enviar por WhatsApp
                  </a>

                  <div className="bg-slate-50 rounded-lg p-3 text-left text-sm mt-4">
                    <p><strong>Invitado:</strong> {nombreVisita}</p>
                    <p><strong>Documento:</strong> {docVisita}</p>
                  </div>

                  <button
                    onClick={() => {
                      setQrGenerado(null);
                      setNombreVisita('');
                      setDocVisita('');
                    }}
                    className="mt-4 text-sm text-blue-600 font-medium hover:underline"
                  >
                    Generar otro QR
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PARQUEADERO */}
          {tab === 'parqueadero' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  Cargos de parqueadero
                </h2>
                <p className="text-sm text-slate-500">
                  Consulta las autorizaciones y el estado de los pagos asociados a tu casa.
                </p>
              </div>

              {cargosParqueadero.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                  No tienes cargos de parqueadero registrados.
                </div>
              ) : (
                cargosParqueadero.map((cargo) => {
                  const autorizacion = cargo.charge_authorization_status;
                  const estadoPago = cargo.payment_status;
                  const valor = Number(cargo.amount_due || 0);
                  const pagado = Number(cargo.amount_paid || 0);
                  const saldo = Math.max(0, valor - pagado);
                  const pendienteAutorizacion = autorizacion === 'pending';

                  const textoAutorizacion =
                    autorizacion === 'pending' ? 'Pendiente de autorización' :
                    autorizacion === 'approved' ? 'Autorizado por ti' :
                    autorizacion === 'rejected' ? 'Autorización rechazada' :
                    autorizacion === 'not_required' ? 'No requiere autorización' :
                    'Estado de autorización';

                  const textoPago =
                    estadoPago === 'paid' ? 'Pagado' :
                    estadoPago === 'partial' ? 'Pago parcial' :
                    estadoPago === 'pending' ? 'Pago pendiente' :
                    estadoPago === 'cancelled' ? 'Cancelado' :
                    estadoPago === 'no_charge' ? 'Sin cobro' :
                    'Estado de pago';

                  return (
                    <div
                      key={cargo.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">
                            Cargo por salida de vehículo
                          </p>
                          <p className="text-xs text-slate-500">
                            Salida: {cargo.check_out_at
                              ? new Date(cargo.check_out_at).toLocaleString('es-CO')
                              : 'Fecha no disponible'}
                          </p>
                        </div>

                        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                          autorizacion === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : autorizacion === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : autorizacion === 'rejected'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}>
                          {textoAutorizacion}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center">
                        <div>
                          <p className="text-xs text-slate-500">Liquidado</p>
                          <p className="font-bold text-slate-800">
                            ${valor.toLocaleString('es-CO')}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">Pagado</p>
                          <p className="font-bold text-emerald-700">
                            ${pagado.toLocaleString('es-CO')}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">Saldo</p>
                          <p className="font-bold text-amber-700">
                            ${saldo.toLocaleString('es-CO')}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-3 py-1 font-semibold ${
                          estadoPago === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : estadoPago === 'partial' || estadoPago === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : estadoPago === 'cancelled'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}>
                          {textoPago}
                        </span>
                      </div>

                      {pendienteAutorizacion && (
                        <>
                          <p className="text-xs text-amber-700">
                            Esta autorización permite asignarte la responsabilidad del cobro.
                            Aprobarla no registra un pago; el pago se registra posteriormente en portería.
                          </p>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => responderCargoParqueadero(cargo.id, true)}
                              disabled={respondiendoCargo === cargo.id}
                              className="rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {respondiendoCargo === cargo.id ? 'Procesando...' : 'Aprobar'}
                            </button>

                            <button
                              onClick={() => responderCargoParqueadero(cargo.id, false)}
                              disabled={respondiendoCargo === cargo.id}
                              className="rounded-lg bg-red-100 py-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                            >
                              {respondiendoCargo === cargo.id ? 'Procesando...' : 'Rechazar'}
                            </button>
                          </div>
                        </>
                      )}

                      {autorizacion === 'approved' && saldo > 0 && (
                        <p className="text-xs text-emerald-700">
                          Autorizaste este cobro. El saldo todavía no se considera recaudado;
                          debe registrarse el pago correspondiente.
                        </p>
                      )}

                      {autorizacion === 'rejected' && (
                        <p className="text-xs text-red-700">
                          Rechazaste este cargo. La decisión quedó registrada.
                        </p>
                      )}

                      {estadoPago === 'paid' && (
                        <p className="text-xs text-emerald-700">
                          El pago está registrado en el sistema.
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
          {/* RESERVAS */}
          {tab === 'reservas' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">
                Reservar Zona Común
              </h2>

              <form
                onSubmit={crearReserva}
                className="space-y-4 bg-white p-4 rounded-xl border border-slate-200"
              >
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Área Común</span>
                  <select
                    value={reservaForm.areaId}
                    onChange={(e) => setReservaForm({ ...reservaForm, areaId: e.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  >
                    <option value="">Seleccionar área...</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </option>
                    ))}
                  </select>
                </label>

                {(() => {
                  const areaSeleccionada = areas.find((area) => area.id === reservaForm.areaId);
                  if (!areaSeleccionada) return null;
                  const tarifa = Number(areaSeleccionada.reservation_fee || 0);
                  return (
                    <div className="rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="font-semibold text-slate-800">
                        {tarifa === 0 ? 'Reserva sin costo' : 'Valor: ' + new Intl.NumberFormat('es-CO', { style: 'currency', currency: areaSeleccionada.currency || 'COP', maximumFractionDigits: 0 }).format(tarifa)}
                      </p>
                      {tarifa > 0 && (
                        <label className="mt-3 block">
                          <span className="font-medium text-slate-700">Modalidad de pago</span>
                          <select
                            required
                            value={reservaForm.paymentMode}
                            onChange={(e) => setReservaForm({ ...reservaForm, paymentMode: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"
                          >
                            <option value="">Seleccionar modalidad...</option>
                            {areaSeleccionada.allow_prepaid && <option value="prepaid">Pago anticipado</option>}
                            {areaSeleccionada.allow_account_charge && <option value="account">Cargo a cuenta de la casa</option>}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })()}

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Fecha</span>
                  <input
                    type="date"
                    value={reservaForm.date}
                    onChange={(e) => setReservaForm({ ...reservaForm, date: e.target.value })}
                    required
                    min={new Date().toISOString().split('T')[0]}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Hora Inicio</span>
                    <input
                      type="time"
                      value={reservaForm.startTime}
                      onChange={(e) => setReservaForm({ ...reservaForm, startTime: e.target.value })}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Hora Fin</span>
                    <input
                      type="time"
                      value={reservaForm.endTime}
                      onChange={(e) => setReservaForm({ ...reservaForm, endTime: e.target.value })}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={enviandoReserva}
                  className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white mt-2 disabled:opacity-50"
                >
                  {enviandoReserva ? 'Solicitando...' : 'Solicitar Reserva'}
                </button>
              </form>

              <div className="mt-8">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Mis Reservas</h3>

                {misReservas.length === 0 ? (
                  <p className="text-sm text-slate-400">No tienes reservas.</p>
                ) : (
                  misReservas.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 mb-3 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">
                            {(r.areas_comunes as any)?.icon} {(r.areas_comunes as any)?.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {r.date} · {r.start_time} - {r.end_time}
                          </p>
                        </div>

                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            r.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : r.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {r.status === 'pending'
                            ? 'Pendiente'
                            : r.status === 'approved'
                              ? 'Aprobada'
                              : 'Rechazada'}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs">
                        <div><p className="text-slate-500">Valor</p><p className="font-bold text-slate-800">{Number(r.amount_due || 0).toLocaleString('es-CO')} {r.currency || 'COP'}</p></div>
                        <div><p className="text-slate-500">Pagado</p><p className="font-bold text-emerald-700">{Number(r.amount_paid || 0).toLocaleString('es-CO')}</p></div>
                        <div><p className="text-slate-500">Saldo</p><p className="font-bold text-amber-700">{Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0)).toLocaleString('es-CO')}</p></div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Estado financiero: {r.payment_status === 'paid' ? 'Pagado' : r.payment_status === 'partial' ? 'Pago parcial' : r.payment_status === 'not_required' ? 'Sin cobro' : 'Pendiente'}
                        {' · Modalidad: '}{r.payment_mode === 'prepaid' ? 'Anticipado' : r.payment_mode === 'account' ? 'Cargo a cuenta' : 'Sin costo'}
                      </p>
                      {Array.isArray(r.reserva_movimientos_financieros) && r.reserva_movimientos_financieros.length > 0 && (
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <p className="mb-2 text-xs font-semibold text-slate-600">Movimientos</p>
                          {r.reserva_movimientos_financieros.map((movement: any) => (
                            <p key={movement.id} className="text-xs text-slate-500">
                              {movement.movement_type === 'charge' ? 'Cargo a cuenta' : movement.movement_type === 'payment' ? 'Pago' : 'Ajuste'} · {Number(movement.amount).toLocaleString('es-CO')} · {movement.verification_status === 'confirmed' ? 'Confirmado' : movement.verification_status === 'rejected' ? 'Rechazado' : 'Pendiente de validación'}
                            </p>
                          ))}
                        </div>
                      )}
                      {r.amount_due > r.amount_paid && ['pending','approved'].includes(r.status) && r.payment_mode !== 'free' && (
                        <form onSubmit={(e) => reportarPago(e, r)} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                          <p className="text-xs font-semibold text-slate-700">Reportar abono o pago</p>
                          <input name="amount" type="number" min="1" max={Number(r.amount_due) - Number(r.amount_paid)} step="1" required placeholder="Valor pagado" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
                          <select name="payment_method" required defaultValue="" className="w-full rounded-lg border border-slate-300 p-2 text-sm">
                            <option value="" disabled>Medio de pago</option>
                            {(r.tariff_snapshot?.payment_methods || []).map((method: string) => (
                              <option key={method} value={method}>{method === 'transfer' ? 'Transferencia' : method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : 'Otro'}</option>
                            ))}
                          </select>
                          <input name="reference" placeholder="Referencia (opcional)" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
                          <textarea name="notes" rows={2} placeholder="Observaciones (opcional)" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
                          <button disabled={enviandoPagoId === r.id} className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                            {enviandoPagoId === r.id ? 'Enviando...' : 'Reportar pago'}
                          </button>
                        </form>
                      )}
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

          {/* PQRS */}
          {tab === 'pqrs' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Enviar PQRS</h2>

              <form onSubmit={enviarPQRS} className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Tipo de solicitud</span>
                  <select
                    value={tipoPQRS}
                    onChange={(e) => setTipoPQRS(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  >
                    <option value="Peticion">Petición</option>
                    <option value="Queja">Queja</option>
                    <option value="Reclamo">Reclamo</option>
                    <option value="Sugerencia">Sugerencia</option>
                    <option value="Felicitacion">Felicitación</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Asunto</span>
                  <input
                    type="text"
                    value={asuntoPQRS}
                    onChange={(e) => setAsuntoPQRS(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                    placeholder="Ej: Ruido en el piso 3"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Descripción</span>
                  <textarea
                    value={descPQRS}
                    onChange={(e) => setDescPQRS(e.target.value)}
                    required
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                    placeholder="Detalla tu solicitud..."
                  />
                </label>

                <button
                  type="submit"
                  disabled={enviandoPQRS}
                  className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white mt-2 disabled:opacity-50"
                >
                  {enviandoPQRS ? 'Enviando...' : 'Enviar PQRS'}
                </button>
              </form>

              <div className="mt-8">
                <h3 className="text-sm font-bold text-slate-700 mb-3">
                  Tus últimas solicitudes:
                </h3>

                {misPqrs.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No has enviado ninguna solicitud.
                  </p>
                ) : (
                  misPqrs.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 mb-3 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{p.subject}</p>
                          <p className="text-xs text-slate-500">
                            {p.type} · {new Date(p.created_at).toLocaleDateString()}
                          </p>
                        </div>

                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            p.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : p.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.status === 'pending'
                            ? 'Pendiente'
                            : p.status === 'in_progress'
                              ? 'En Proceso'
                              : 'Resuelto'}
                        </span>
                      </div>

                      {p.response && (
                        <div className="mt-3 bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                          <p className="text-xs font-bold text-emerald-800 mb-1">
                            Respuesta de la Administración:
                          </p>
                          <p className="text-sm text-emerald-700">{p.response}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* MURO */}
          {tab === 'muro' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Comunicados</h2>

              {comunicados.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <span className="text-5xl mb-2 block">✉</span>
                  <p>No hay comunicados.</p>
                </div>
              ) : (
                comunicados.map((c) => (
                  <div
                    key={c.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          c.type === 'alerta'
                            ? 'bg-red-100 text-red-700'
                            : c.type === 'evento'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {c.type}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
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







