'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const COURIERS = ['Amazon', 'DHL', 'Servientrega', 'MercadoLibre', 'FedEx', 'Otro'];
const TENANT_ID = '86aacb9e-5bf0-4ff1-926d-2a941529d035';

export default function LobbyPage() {
  const router = useRouter();
  const [courier, setCourier] = useState(COURIERS[0]);
  const [tracking, setTracking] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados para el destinatario
  const [towers, setTowers] = useState<any[]>([]);
  const [towerId, setTowerId] = useState('');
  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');

  // Cargar las torres al iniciar
  useEffect(() => {
    async function cargarTorres() {
      const { data } = await supabase
        .from('towers')
        .select('id, name')
        .eq('tenant_id', TENANT_ID)
        .order('name');
      if (data) setTowers(data);
    }
    cargarTorres();
  }, []);

  // Cuando se selecciona una torre, cargar sus apartamentos
  useEffect(() => {
    if (!towerId) {
      setUnits([]);
      setUnitId('');
      return;
    }
    async function cargarUnidades() {
      const { data } = await supabase
        .from('units')
        .select('id, code')
        .eq('tower_id', towerId)
        .order('code');
      if (data) setUnits(data);
    }
    cargarUnidades();
  }, [towerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo || !unitId) {
      setErrorMsg('Por favor, sube una foto y selecciona el apartamento.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Subir la foto (SIN upsert para evitar errores de RLS)
      const fileExt = photo.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('evidences')
        .upload(fileName, photo, { 
          contentType: photo.type 
        });

      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('evidences').getPublicUrl(fileName);

      // 2. Generar PIN
      const generatedPin = Math.floor(100000 + Math.random() * 900000).toString();

      // 3. Guardar en base de datos
      const { error: dbError } = await supabase.from('packages').insert({
        tenant_id: TENANT_ID,
        recipient_unit_id: unitId,
        courier: courier,
        tracking_number: tracking || null,
        photo_url: publicUrl,
        status: 'received',
        pin_hash: generatedPin,
        received_by: (await supabase.auth.getUser()).data.user?.id
      });

      if (dbError) throw dbError;
      setPin(generatedPin);
      
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
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">
          ← Volver
        </button>
      </header>

      {pin ? (
        <div className="max-w-xl rounded-2xl bg-emerald-50 p-8 text-center shadow-lg border border-emerald-200">
          <h2 className="text-2xl font-bold text-emerald-900 mb-2">¡Paquete Registrado!</h2>
          <p className="text-emerald-700 mb-6">El residente ha sido notificado.</p>
          <div className="bg-white rounded-xl p-6 inline-block shadow-sm">
            <p className="text-sm text-slate-500 mb-1">PIN de retiro (6 dígitos)</p>
            <p className="text-5xl font-black tracking-widest text-emerald-600">{pin}</p>
          </div>
          <div className="mt-8">
            <button onClick={() => { setPin(null); setPhoto(null); setTracking(''); setUnitId(''); setTowerId(''); }} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700">
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

          {/* SELECTOR DE DESTINATARIO */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <p className="text-sm font-bold text-slate-800">📍 Destinatario (Residente)</p>
            
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Torre</span>
                <select 
                  value={towerId} 
                  onChange={(e) => setTowerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {towers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Apartamento</span>
                <select 
                  value={unitId} 
                  onChange={(e) => setUnitId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900 disabled:opacity-50"
                  disabled={!towerId}
                  required
                >
                  <option value="">Seleccionar...</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}
                </select>
              </label>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Foto del paquete</span>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-[#1E3A5F] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#152945]" required />
          </label>

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50">
            {loading ? 'Guardando paquete…' : 'Registrar paquete y generar PIN'}
          </button>
        </form>
      )}
    </div>
  );
}