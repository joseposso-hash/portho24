'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const COURIERS = ['Amazon', 'DHL', 'Servientrega', 'MercadoLibre', 'FedEx', 'Otro'];

export default function LobbyPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const [courier, setCourier] = useState(COURIERS[0]);
  const [tracking, setTracking] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');
  const [unitSearch, setUnitSearch] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
      
      if (profile) {
        setTenantId(profile.tenant_id);
        const { data } = await supabase.from('units').select('id, code').order('code');
        if (data) setUnits(data);
      }
    }
    init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo || !unitId || !tenantId) {
      setErrorMsg('Por favor, sube una foto y escribe una casa válida.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      const fileExt = photo.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('evidences').upload(fileName, photo, { contentType: photo.type });

      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('evidences').getPublicUrl(fileName);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('La sesión expiró. Inicia sesión nuevamente.');

      const response = await fetch('/api/paquetes/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ unitId, courier, tracking, photoUrl: publicUrl })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No fue posible registrar el paquete.');
      setPin('registrado');
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al registrar el paquete.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📦 Recibir Paquete</h1>
          <p className="text-sm text-slate-500">Ingresa los datos del paquete recibido</p>
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">← Volver</button>
      </header>

      {pin ? (
        <div className="max-w-xl rounded-2xl bg-emerald-50 p-8 text-center shadow-lg border border-emerald-200">
          <h2 className="text-2xl font-bold text-emerald-900 mb-2">¡Paquete Registrado!</h2>
          <p className="text-emerald-700 mb-6">Registro confirmado. El PIN queda reservado para consulta del residente; vigilancia no puede verlo.</p>
          <div className="bg-white rounded-xl p-6 inline-block shadow-sm">
            <p className="text-sm font-semibold text-emerald-800">Paquete registrado correctamente</p>
            <p className="text-sm text-slate-500 mt-1">El PIN no se muestra al personal de vigilancia.</p>
          </div>
          <div className="mt-8">
            <button onClick={() => { setPin(null); setPhoto(null); setTracking(''); setUnitId(''); setUnitSearch(''); }} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700">
              Registrar otro paquete
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-5 rounded-2xl bg-white p-8 shadow-lg">
          {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Empresa de envío</span>
            <select value={courier} onChange={(e) => setCourier(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900">
              {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Nº de guía (opcional)</span>
            <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ej: AMZ-123456" className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" />
          </label>

          {/* SELECTOR DE DESTINATARIO (SOLO TEXTO, SIN DATALIST) */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <p className="text-sm font-bold text-slate-800">📍 Destinatario (Residente)</p>
            
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Casa / Unidad</span>
              <input
                type="text"
                value={unitSearch}
                onChange={(e) => {
                  setUnitSearch(e.target.value);
                  const found = units.find(u => u.code.toLowerCase() === e.target.value.toLowerCase());
                  setUnitId(found ? found.id : '');
                }}
                placeholder="Escribe la casa (ej. 125)"
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Foto del paquete</span>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-[#1E3A5F] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#152945]" required />
          </label>

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50">
            {loading ? 'Guardando paquete…' : 'Registrar paquete'}
          </button>
        </form>
      )}
    </div>
  );
}