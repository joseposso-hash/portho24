'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import EvidenceImage from '../components/EvidenceImage';

export default function RetiroPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paquete, setPaquete] = useState<any>(null);
  const [firmada, setFirmada] = useState(false);
  const [dibujando, setDibujando] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validarAcceso() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('tenant_id, role, is_active')
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;
        if (!profile || profile.is_active !== true) {
          throw new Error('El usuario no está activo. Contacta al administrador.');
        }

        if (profile.role !== 'guard') {
          throw new Error('Esta pantalla está disponible únicamente para vigilancia.');
        }

        if (!profile.tenant_id) {
          throw new Error('El usuario no tiene un conjunto asignado.');
        }

        if (!cancelled) setAuthorized(true);
      } catch (error) {
        if (!cancelled) {
          setErrorMsg(
            error instanceof Error ? error.message : 'No fue posible validar el acceso.'
          );
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    validarAcceso();

    return () => {
      cancelled = true;
    };
  }, []);

  async function solicitarValidacion(
    pickup: boolean,
    signature?: string
  ) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session?.access_token) {
      throw new Error('La sesión expiró. Inicia sesión nuevamente.');
    }

    const response = await fetch('/api/paquetes/verificar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ pin, pickup, signature }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'No fue posible validar el PIN.');
    }

    return result;
  }

  function iniciarFirma(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';

    setDibujando(true);
  }

  function continuarFirma(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineTo(x, y);
    ctx.stroke();
    setFirmada(true);
  }

  function terminarFirma() {
    setDibujando(false);
  }

  function borrarFirma() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    setFirmada(false);
  }

  function limpiarValidacion() {
    setPaquete(null);
    setPin('');
    setErrorMsg(null);
    setFirmada(false);
    setDibujando(false);
    borrarFirma();
  }

  async function handleBuscar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (pin.length !== 6 || loading || !authorized) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await solicitarValidacion(false);
      setPaquete(result.package);
      setFirmada(false);
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'PIN inválido o paquete no disponible.'
      );
      setPaquete(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirmarRetiro() {
    if (!paquete || loading || !firmada || !authorized) return;

    const canvas = canvasRef.current;
    if (!canvas) {
      setErrorMsg('No fue posible leer la firma.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const signature = canvas.toDataURL('image/png');
      await solicitarValidacion(true, signature);
      alert('¡Paquete entregado con éxito!');
      router.push('/');
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'No fue posible confirmar la entrega.'
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-xl mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Entrega de paquete
          </h1>
          <p className="text-sm text-slate-500">
            Valida el PIN presentado por el residente.
          </p>
        </div>

        <button
          onClick={() => router.push('/')}
          className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50"
        >
          Volver
        </button>
      </header>

      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-lg">
        {initializing ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Validando acceso...
          </p>
        ) : !authorized ? (
          <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">
            {errorMsg || 'No tienes autorización para acceder.'}
          </div>
        ) : !paquete ? (
          <form onSubmit={handleBuscar} className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl">
                #
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Validar entrega
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Ingresa el PIN de seis dígitos que muestra el residente.
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                PIN de 6 dígitos
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full border-b-2 border-slate-300 pb-4 text-center text-5xl font-black tracking-[0.5em] text-slate-900 placeholder:text-slate-200 focus:border-emerald-500 focus:outline-none"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading || pin.length !== 6}
              className="w-full rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50"
            >
              {loading ? 'Validando...' : 'Validar PIN'}
            </button>
          </form>
        ) : (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
              ✓
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                PIN validado
              </h2>
              <p className="text-slate-500">
                Empresa: {paquete.courier || 'No especificada'}
              </p>
            </div>

            {paquete.photo_url && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-sm text-slate-500">Foto del paquete</p>
                <EvidenceImage
                  src={paquete.photo_url}
                  alt="Paquete"
                  className="mx-auto h-40 rounded-lg object-contain shadow-sm"
                />
              </div>
            )}

            {errorMsg && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3 text-left">
              <div>
                <h3 className="font-semibold text-slate-800">
                  Firma del residente
                </h3>
                <p className="text-sm text-slate-500">
                  Solicita al residente firmar en este dispositivo.
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white">
                <canvas
                  ref={canvasRef}
                  width={900}
                  height={320}
                  onPointerDown={iniciarFirma}
                  onPointerMove={continuarFirma}
                  onPointerUp={terminarFirma}
                  onPointerCancel={terminarFirma}
                  className="block h-48 w-full touch-none"
                  style={{ touchAction: 'none' }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {firmada ? 'Firma capturada' : 'Pendiente de firma'}
                </span>
                <button
                  type="button"
                  onClick={borrarFirma}
                  disabled={loading}
                  className="text-sm font-medium text-red-600 underline"
                >
                  Borrar firma
                </button>
              </div>
            </div>

            <button
              onClick={confirmarRetiro}
              disabled={loading || !firmada}
              className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'Firmar y confirmar entrega'}
            </button>

            <button
              onClick={limpiarValidacion}
              disabled={loading}
              className="text-sm font-medium text-slate-500 underline"
            >
              Cancelar validación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
