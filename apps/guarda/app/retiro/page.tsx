'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function RetiroPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paquete, setPaquete] = useState<any>(null);

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    // Buscamos el paquete por su PIN
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('pin_hash', pin)
      .eq('status', 'received')
      .single();

    if (error || !data) {
      setErrorMsg('PIN inválido o el paquete ya fue retirado.');
      setPaquete(null);
    } else {
      setPaquete(data);
    }
    setLoading(false);
  }

  async function confirmarRetiro() {
    if (!paquete) return;
    setLoading(true);

    const { error } = await supabase
      .from('packages')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', paquete.id);

    if (error) {
      setErrorMsg('Error al actualizar el paquete.');
      setLoading(false);
    } else {
      alert('¡Paquete entregado con éxito!');
      router.push('/');
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-xl mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📦 Entrega de Paquete</h1>
          <p className="text-sm text-slate-500">Valida el PIN del residente</p>
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">
          ← Volver
        </button>
      </header>

      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-lg">
        {!paquete ? (
          <form onSubmit={handleBuscar} className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl">
                🔢
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Ingresa el PIN de 6 dígitos</h2>
              <p className="text-sm text-slate-500 mt-1">El residente te lo mostrará en su app.</p>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">{errorMsg}</div>
            )}

            <input
              type="text"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full text-center text-5xl font-black tracking-[0.5em] text-slate-900 placeholder:text-slate-200 border-b-2 border-slate-300 focus:border-emerald-500 focus:outline-none pb-4"
              required
            />

            <button
              type="submit"
              disabled={loading || pin.length !== 6}
              className="w-full rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50"
            >
              {loading ? 'Buscando…' : 'Validar PIN'}
            </button>
          </form>
        ) : (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
              ✅
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Paquete Encontrado</h2>
              <p className="text-slate-500">Empresa: {paquete.courier}</p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-sm text-slate-500 mb-2">Foto del paquete</p>
              <img src={paquete.photo_url} alt="Paquete" className="mx-auto h-40 object-contain rounded-lg shadow-sm" />
            </div>

            <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 text-left">
              <strong>Firma digital:</strong> En la versión final, aquí el residente firmaría en la pantalla. Para este demo, asumiremos que el residente firmó.
            </div>

            <button
              onClick={confirmarRetiro}
              disabled={loading}
              className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Procesando…' : 'Confirmar Entrega y Cerrar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}