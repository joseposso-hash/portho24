'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function ParkingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Parámetros que vienen desde la Visita No Anunciada
  const visitIdParam = searchParams.get('visit_id');
  const nombreParam = searchParams.get('nombre');
  const docParam = searchParams.get('doc');
  const casaParam = searchParams.get('casa');

  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const [placa, setPlaca] = useState('');
  const [apto, setApto] = useState(casaParam || '');
  const [conductor, setConductor] = useState(nombreParam || '');
  const [docConductor, setDocConductor] = useState(docParam || '');
  const [fotoConductor, setFotoConductor] = useState<File | null>(null);
  const [fotoVehiculo, setFotoVehiculo] = useState<File | null>(null); 
  
  const [loading, setLoading] = useState(false);
  const [vehiculo, setVehiculo] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<any>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
      if (profile) setTenantId(profile.tenant_id);
    }
    init();
  }, []);

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!placa || !tenantId) return;
    setLoading(true);
    setErrorMsg(null);
    setRecibo(null);

    const placaUpper = placa.toUpperCase();

    try {
      // Buscar vehículo sin .single() para evitar error 406
      let { data: vehiculosEncontrados } = await supabase
        .from('vehicles')
        .select('*')
        .eq('plate', placaUpper)
        .eq('tenant_id', tenantId)
        .limit(1);

      let veh = vehiculosEncontrados && vehiculosEncontrados.length > 0 ? vehiculosEncontrados[0] : null;

      if (!veh) {
        const { data: newVeh, error: errNewVeh } = await supabase
          .from('vehicles')
          .insert({ tenant_id: tenantId, plate: placaUpper, type: 'car' })
          .select()
          .single();
        if (errNewVeh) throw new Error(errNewVeh.message);
        veh = newVeh;
      }

      const { data: sessions, error: errSes } = await supabase
        .from('parking_sessions')
        .select('*')
        .eq('vehicle_id', veh.id)
        .eq('status', 'active');

      if (errSes) throw new Error(errSes.message);

      const activeSession = sessions && sessions.length > 0 ? sessions[0] : null;

      if (activeSession) {
        const checkInTime = new Date(activeSession.check_in_at).getTime();
        const now = new Date().getTime();
        const diffMins = Math.floor((now - checkInTime) / 60000);
        
        let total = 0;
        if (diffMins > 15) {
          const hours = Math.ceil(diffMins / 60);
          total = hours * 3000;
        }

        setVehiculo({ ...veh, activeSession, diffMins });
        setRecibo({ total, sessionId: activeSession.id });
      } else {
        setVehiculo({ ...veh, activeSession: null });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al buscar la placa.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmarEntrada() {
    if (!apto || !conductor || !docConductor || !fotoConductor || !fotoVehiculo || !tenantId) {
      setErrorMsg('Por favor, completa los datos y toma ambas fotos.');
      return;
    }
    
    setLoading(true);
    
    try {
      // 1. Subir Foto del Conductor
      const fileExtCond = fotoConductor.name.split('.').pop();
      const fileNameCond = `conductores/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtCond}`;
      const { error: errUpCond } = await supabase.storage.from('evidences').upload(fileNameCond, fotoConductor, { contentType: fotoConductor.type });
      if (errUpCond) throw errUpCond;
      const { data: { publicUrl: urlConductor } } = supabase.storage.from('evidences').getPublicUrl(fileNameCond);

      // 2. Subir Foto del Vehículo
      const fileExtVeh = fotoVehiculo.name.split('.').pop();
      const fileNameVeh = `vehiculos/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtVeh}`;
      const { error: errUpVeh } = await supabase.storage.from('evidences').upload(fileNameVeh, fotoVehiculo, { contentType: fotoVehiculo.type });
      if (errUpVeh) throw errUpVeh;
      const { data: { publicUrl: urlVehiculo } } = supabase.storage.from('evidences').getPublicUrl(fileNameVeh);

      // 3. Guardar en base de datos
      const { error } = await supabase.from('parking_sessions').insert({
        tenant_id: tenantId,
        vehicle_id: vehiculo.id,
        visit_id: visitIdParam || null, // <-- VINCULAMOS A LA VISITA SI VIENE DE ALLÍ
        status: 'active',
        check_in_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        notes: `Conductor: ${conductor} - Doc: ${docConductor} - Destino: Casa ${apto}`,
        photo_url: urlVehiculo,
        driver_photo_url: urlConductor
      });

      if (error) throw error;

      alert(`🚗 Vehículo ingresado.\nConductor: ${conductor}\nDestino: Casa ${apto}`);
      router.push('/');
    } catch (err: any) {
      setErrorMsg('Error al registrar entrada: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmarSalida(monto: number, metodo: string) {
    if (!recibo) return;
    setLoading(true);
    
    try {
      const { error } = await supabase.from('parking_sessions').update({
        status: 'paid', check_out_at: new Date().toISOString(), amount_due: monto, amount_paid: monto, payment_method: metodo
      }).eq('id', recibo.sessionId);

      if (error) throw error;
      alert(`✅ Salida registrada. Cobro: $${monto.toLocaleString('es-CO')}`);
      window.location.reload();
    } catch (err: any) {
      setErrorMsg('Error al registrar salida: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-lg mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🚗 Control de Vehículos</h1>
          {visitIdParam && <p className="text-xs text-emerald-600 font-medium">Continuando registro de visita...</p>}
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">← Volver</button>
      </header>

      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        {!vehiculo ? (
          <form onSubmit={handleBuscar} className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-slate-900">Ingresa la placa</h2>
            </div>
            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}
            <input type="text" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} className="w-full text-center text-4xl font-black tracking-widest text-slate-900 border-b-2 border-slate-300 focus:border-emerald-500 focus:outline-none pb-4 uppercase" required />
            <button type="submit" disabled={loading || placa.length < 5} className="w-full rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50">
              {loading ? 'Buscando…' : 'Buscar Placa'}
            </button>
          </form>
        ) : vehiculo.activeSession ? (
          <div className="space-y-6 text-center">
            <h2 className="text-2xl font-bold text-slate-900">Salida de Vehículo</h2>
            <p className="text-3xl font-black text-slate-700 tracking-widest">{vehiculo.plate}</p>
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 mb-4">
              <p className="text-sm text-emerald-600 font-medium">Total a cobrar</p>
              <p className="text-4xl font-black text-emerald-700">${recibo.total.toLocaleString('es-CO')}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={() => confirmarSalida(recibo.total, 'cash')} disabled={loading} className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700">Cobrar y dar Salida</button>
              <button onClick={() => confirmarSalida(0, 'free')} disabled={loading} className="w-full rounded-xl bg-slate-200 py-3 text-sm font-semibold text-slate-700">Dar Salida sin Cobro</button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">Registrar Entrada</h2>
              <p className="text-3xl font-black text-slate-700 tracking-widest mt-2">{vehiculo.plate}</p>
            </div>
            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}
            
            <div className="grid grid-cols-1 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Casa / Unidad Destino</span>
                <input type="text" value={apto} onChange={(e) => setApto(e.target.value)} placeholder="Ej: 125" className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" required />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre del Conductor</span>
                <input type="text" value={conductor} onChange={(e) => setConductor(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" required />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Documento</span>
                <input type="text" value={docConductor} onChange={(e) => setDocConductor(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" required />
              </label>
            </div>

            <div>
              <span className="text-sm font-medium text-slate-700 block mb-2">Foto del Conductor</span>
              <label className="flex items-center justify-center w-full h-20 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                <span className="flex flex-col items-center space-y-1">
                  <span className="text-2xl">🧑</span>
                  <span className="font-medium text-slate-600 text-xs">{fotoConductor ? '✅ Foto conductor capturada' : 'Tomar foto del conductor'}</span>
                </span>
                <input type="file" accept="image/*" capture="user" onChange={(e) => setFotoConductor(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>

            <div>
              <span className="text-sm font-medium text-slate-700 block mb-2">Foto del Vehículo</span>
              <label className="flex items-center justify-center w-full h-20 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                <span className="flex flex-col items-center space-y-1">
                  <span className="text-2xl">🚗</span>
                  <span className="font-medium text-slate-600 text-xs">{fotoVehiculo ? '✅ Foto vehículo capturada' : 'Tomar foto del vehículo'}</span>
                </span>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoVehiculo(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>

            <button onClick={confirmarEntrada} disabled={loading} className="w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white transition hover:bg-blue-700">
              {loading ? 'Registrando…' : 'Dar Entrada al Vehículo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}