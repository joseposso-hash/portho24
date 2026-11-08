'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function RetiroPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [packageRef, setPackageRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paquete, setPaquete] = useState<any>(null);

  async function solicitarValidacion(pickup: boolean) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('La sesión expiró. Inicia sesión nuevamente.');
    const response = await fetch('/api/paquetes/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ packageRef, pin, pickup })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible validar el PIN.');
    return result;
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await solicitarValidacion(false);
      setPaquete(result.package);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'PIN inválido o paquete no disponible.');
      setPaquete(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirmarRetiro() {
    if (!paquete) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await solicitarValidacion(true);
      alert('¡Paquete entregado con éxito!');
      router.push('/');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No fue posible confirmar la entrega.');
      setPaquete(null);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-xl mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📦 Entrega de Paquete</h1>
          <p className="text-sm text-slate-500">Valida el PIN presentado por el residente</p>
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">← Volver</button>
      </header>
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-lg">
        {!paquete ? (
          <form onSubmit={handleBuscar} className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl">🔢</div>
              <h2 className="text-xl font-semibold text-slate-900">Validar entrega</h2>
              <p className="text-sm text-slate-500 mt-1">Ingresa la referencia y el PIN que muestra el residente.</p>
            </div>
            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">{errorMsg}</div>}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Referencia del paquete</span>
              <input type="text" maxLength={8} value={packageRef} onChange={e => setPackageRef(e.target.value.replace(/[^a-f0-9]/gi, '').slice(0, 8))}
                placeholder="8 caracteres" className="w-full rounded-lg border border-slate-300 p-3 text-center font-mono text-xl uppercase text-slate-900" required />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">PIN de 6 dígitos</span>
              <input type="text" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" className="w-full border-b-2 border-slate-300 pb-4 text-center text-5xl font-black tracking-[0.5em] text-slate-900 placeholder:text-slate-200 focus:border-emerald-500 focus:outline-none" required />
            </label>
            <button type="submit" disabled={loading || pin.length !== 6 || packageRef.length !== 8}
              className="w-full rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50">
              {loading ? 'Validando…' : 'Validar PIN'}
            </button>
          </form>
        ) : (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">✅</div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">PIN validado</h2>
              <p className="text-slate-500">Empresa: {paquete.courier}</p>
            </div>
            {paquete.photo_url && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm text-slate-500">Foto del paquete</p>
              <img src={paquete.photo_url} alt="Paquete" className="mx-auto h-40 rounded-lg object-contain shadow-sm" />
            </div>}
            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}
            <button onClick={confirmarRetiro} disabled={loading}
              className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
              {loading ? 'Procesando…' : 'Confirmar entrega y cerrar'}
            </button>
            <button onClick={() => { setPaquete(null); setPin(''); setPackageRef(''); }} disabled={loading}
              className="text-sm font-medium text-slate-500 underline">Cancelar validación</button>
          </div>
        )}
      </div>
    </div>
  );
}
