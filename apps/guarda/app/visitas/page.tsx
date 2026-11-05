'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const TENANT_ID = '86aacb9e-5bf0-4ff1-926d-2a941529d035';

export default function VisitasPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Destinatario
  const [towers, setTowers] = useState<any[]>([]);
  const [towerId, setTowerId] = useState('');
  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');

  // Vehículo y Foto
  const [vieneEnVehiculo, setVieneEnVehiculo] = useState(false);
  const [placaVehiculo, setPlacaVehiculo] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState('car');
  const [fotoVisitante, setFotoVisitante] = useState<File | null>(null);
  const [fotoVehiculo, setFotoVehiculo] = useState<File | null>(null);

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
      setErrorMsg('Por favor, llena los datos del visitante y selecciona el apartamento.');
      return;
    }
    if (vieneEnVehiculo && (!placaVehiculo || !fotoVehiculo)) {
      setErrorMsg('Debes ingresar la placa y tomar la foto del vehículo.');
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

      // 2. Subir foto del visitante (Opcional en este flujo, pero recomendado)
      let urlVisitante = null;
      if (fotoVisitante) {
        const fileExt = fotoVisitante.name.split('.').pop();
        const fileName = `visitantes/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: upErr } = await supabase.storage.from('evidences').upload(fileName, fotoVisitante, { contentType: fotoVisitante.type });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('evidences').getPublicUrl(fileName);
          urlVisitante = publicUrl;
        }
      }

      // 3. Crear la visita (directo como checked_in)
      const { data: visita, error: errVisita } = await supabase
        .from('visits')
        .insert({
          tenant_id: TENANT_ID,
          visitor_id: visitor.id,
          host_user_id: (await supabase.auth.getUser()).data.user?.id,
          unit_id: unitId,
          status: 'checked_in',
          check_in_at: new Date().toISOString(),
          photo_url: urlVisitante
        })
        .select().single();

      if (errVisita) throw errVisita;

      // 4. Si viene en vehículo, registrar en parqueadero
      if (vieneEnVehiculo && placaVehiculo && fotoVehiculo) {
        // Subir foto vehículo
        const fileExtVeh = fotoVehiculo.name.split('.').pop();
        const fileNameVeh = `vehiculos/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtVeh}`;
        const { error: errVeh } = await supabase.storage.from('evidences').upload(fileNameVeh, fotoVehiculo, { contentType: fotoVehiculo.type });
        if (errVeh) throw errVeh;
        const { data: { publicUrl: urlVeh } } = supabase.storage.from('evidences').getPublicUrl(fileNameVeh);

        // Buscar o crear vehículo
        let { data: veh } = await supabase.from('vehicles').select('*').eq('plate', placaVehiculo.toUpperCase()).eq('tenant_id', TENANT_ID).single();
        
        if (!veh) {
          const { data: newVeh, error: errNewVeh } = await supabase.from('vehicles').insert({ tenant_id: TENANT_ID, plate: placaVehiculo.toUpperCase(), type: tipoVehiculo }).select().single();
          if (errNewVeh) throw errNewVeh;
          veh = newVeh;
        }

        // Crear sesión de parqueadero
        if (veh) {
          await supabase.from('parking_sessions').insert({
            tenant_id: TENANT_ID,
            vehicle_id: veh.id,
            visit_id: visita.id,
            unit_id: unitId,
            status: 'active',
            check_in_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            notes: `Visita no anunciada: ${nombre}`,
            photo_url: urlVeh
          });
        }
      }

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

            {/* FOTO DEL VISITANTE (Opcional) */}
            <div>
              <span className="text-sm font-medium text-slate-700 block mb-1">Foto del Visitante (Opcional)</span>
              <label className="flex items-center justify-center w-full h-16 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                <span className="flex flex-col items-center space-y-1">
                  <span className="text-xl">🧑</span>
                  <span className="font-medium text-slate-600 text-xs">
                    {fotoVisitante ? '✅ Foto capturada' : 'Tomar foto del visitante'}
                  </span>
                </span>
                <input type="file" accept="image/*" capture="user" onChange={(e) => setFotoVisitante(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>

            {/* SECCIÓN DE VEHÍCULO */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={vieneEnVehiculo} onChange={(e) => setVieneEnVehiculo(e.target.checked)} className="w-4 h-4 text-[#1E3A5F] rounded focus:ring-[#1E3A5F]" />
                <span className="text-sm font-bold text-slate-700">El visitante viene en vehículo</span>
              </label>

              {vieneEnVehiculo && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">Placa</label>
                      <input type="text" value={placaVehiculo} onChange={(e) => setPlacaVehiculo(e.target.value.toUpperCase())} className="w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900 uppercase" placeholder="ABC123" maxLength={6} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Tipo</label>
                      <select value={tipoVehiculo} onChange={(e) => setTipoVehiculo(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900">
                        <option value="car">Carro</option>
                        <option value="motorcycle">Moto</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center justify-center w-full h-16 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                    <span className="flex flex-col items-center space-y-1">
                      <span className="text-xl">🚗</span>
                      <span className="font-medium text-slate-600 text-xs">
                        {fotoVehiculo ? '✅ Foto vehículo capturada' : 'Tomar foto del vehículo'}
                      </span>
                    </span>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoVehiculo(e.target.files?.[0] || null)} className="hidden" />
                  </label>
                </div>
              )}
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
            {vieneEnVehiculo && <p className="text-sm text-slate-500">Vehículo placa <strong>{placaVehiculo}</strong> registrado en parqueadero.</p>}
            <button onClick={() => { setSuccess(false); setNombre(''); setDocumento(''); setUnitId(''); setTowerId(''); setVieneEnVehiculo(false); setPlacaVehiculo(''); setFotoVisitante(null); setFotoVehiculo(null); }} className="mt-4 rounded-xl bg-[#1E3A5F] px-6 py-3 font-semibold text-white hover:bg-[#152945]">
              Registrar otra visita
            </button>
          </div>
        )}
      </div>
    </div>
  );
}