'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

export default function VisitasPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [towers, setTowers] = useState<any[]>([]);
  const [towerId, setTowerId] = useState('');
  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');

  useEffect(() => {
    async function cargarTorres() {
      const { data } = await supabase.from('towers').select('id, name').eq('tenant_id', TENANT_ID).order('name');
      if (data) setTowers(data);
    }
    cargarTorres();
  }, []);

  useEffect(() => {
    if (!towerId) {
      setUnits([]);
      setUnitId('');
      return;
    }
    async function cargarUnidades() {
      const { data } = await supabase.from('units').select('id, code').eq('tower_id', towerId).order('code');
      if (data) setUnits(data);
    }
    cargarUnidades();
  }, [towerId]);

  async function registrarVisita(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre || !documento || !unitId) {
      setErrorMsg('Por favor, llena todos los campos y selecciona el apartamento.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Guardar el visitante
      const { data: visitor, error: errVis } = await supabase
        .from('visitors')
        .insert({ tenant_id: TENANT_ID, full_name: nombre, doc_number: documento })
        .select().single();

      if (errVis) throw errVis;

      // 2. Crear la visita y marcarla como "checked_in" (Adentro)
      const { error: errVisita } = await supabase
        .from('visits')
        .insert({
          tenant_id: TENANT_ID,
          visitor_id: visitor.id,
          host_user_id: (await supabase.auth.getUser()).data.user?.id,
          unit_id: unitId,
          status: 'checked_in', // <-- Entra directamente como "Adentro"
          check_in_at: new Date().toISOString() // <-- Registra la hora exacta
        });

      if (errVisita) throw errVisita;

      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar la visita.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-lg mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">👤 Visita No Anunciada</h1>
          <p className="text-sm text-slate-500">Registro de ingreso en portería</p>
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">
          ← Volver
        </button>
      </header>

      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        {!success ? (
          <form onSubmit={registrarVisita} className="space-y-5">
            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Nombre del visitante</span>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Luis Poveda" className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" required />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Documento de identidad</span>
              <input type="text" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Ej: 10203040" className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" required />
            </label>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <p className="text-sm font-bold text-slate-800">📍 ¿A qué residente visita?</p>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Torre</span>
                  <select value={towerId} onChange={(e) => setTowerId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" required>
                    <option value="">Seleccionar...</option>
                    {towers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Apartamento</span>
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900 disabled:opacity-50" disabled={!towerId} required>
                    <option value="">Seleccionar...</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50 mt-2">
              {loading ? 'Registrando Ingreso…' : 'Dar Ingreso al Visitante'}
            </button>
          </form>
        ) : (
          <div className="text-center space-y-6 py-8">
            <div className="mx-auto h-20 w-20 bg-emerald-100 rounded-full flex items-center justify-center text-4xl">✅</div>
            <h2 className="text-2xl font-bold text-slate-900">Ingreso Registrado</h2>
            <p className="text-slate-500">El visitante ha sido autorizado y registrado en el sistema.</p>
            <button onClick={() => { setSuccess(false); setNombre(''); setDocumento(''); setUnitId(''); setTowerId(''); }} className="mt-4 rounded-xl bg-[#1E3A5F] px-6 py-3 font-semibold text-white hover:bg-[#152945]">
              Registrar otra visita
            </button>
          </div>
        )}
      </div>
    </div>
  );
}