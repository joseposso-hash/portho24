'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

export default function ParkingPage() {
  const router = useRouter();
  const [placa, setPlaca] = useState('');
  const [torre, setTorre] = useState('Torre A');
  const [apto, setApto] = useState('');
  const [conductor, setConductor] = useState('');
  const [docConductor, setDocConductor] = useState('');
  const [fotoVehiculo, setFotoVehiculo] = useState<File | null>(null); 
  const [loading, setLoading] = useState(false);
  const [vehiculo, setVehiculo] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<any>(null);

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!placa) return;
    setLoading(true);
    setErrorMsg(null);
    setRecibo(null);

    const placaUpper = placa.toUpperCase();

    try {
      let { data: veh } = await supabase
        .from('vehicles')
        .select('*')
        .eq('plate', placaUpper)
        .eq('tenant_id', TENANT_ID)
        .single();

      if (!veh) {
        const { data: newVeh, error: errNewVeh } = await supabase
          .from('vehicles')
          .insert({ tenant_id: TENANT_ID, plate: placaUpper, type: 'car' })
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
    if (!apto || !conductor || !docConductor || !fotoVehiculo) {
      setErrorMsg('Por favor, completa los datos y toma una foto del vehículo.');
      return;
    }
    
    setLoading(true);
    const fakeUnitId = '44444444-4444-4444-4444-444444444401'; 
    
    try {
      // 1. Subir la foto
      const fileExt = fotoVehiculo.name.split('.').pop();
      const fileName = `vehiculos/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('evidences')
        .upload(fileName, fotoVehiculo, { contentType: fotoVehiculo.type });

      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('evidences').getPublicUrl(fileName);

      // 2. Guardar en base de datos
      const { error } = await supabase
        .from('parking_sessions')
        .insert({
          tenant_id: TENANT_ID,
          vehicle_id: vehiculo.id,
          unit_id: fakeUnitId, 
          status: 'active',
          check_in_at: new Date().toISOString(),
          notes: `Conductor: ${conductor} - Doc: ${docConductor} - Destino: ${torre} ${apto}`,
          photo_url: publicUrl
        });

      if (error) throw error;

      alert(`🚗 Vehículo ingresado y foto registrada.\nConductor: ${conductor}`);
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
    setErrorMsg(null);
    
    try {
      const { error } = await supabase
        .from('parking_sessions')
        .update({
          status: 'paid',
          check_out_at: new Date().toISOString(),
          amount_due: monto,
          amount_paid: monto,
          payment_method: metodo
        })
        .eq('id', recibo.sessionId);

      if (error) throw error;

      alert(`✅ Salida registrada. ${monto > 0 ? `Cobro: $${monto.toLocaleString('es-CO')}` : 'Sin cobro (Exento).'}`);
      router.push('/');
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
          <p className="text-sm text-slate-500">Entrada y salida de visitantes</p>
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">
          ← Volver
        </button>
      </header>

      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        {!vehiculo ? (
          <form onSubmit={handleBuscar} className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl">
                🅿️
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Ingresa la placa</h2>
            </div>

            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

            <input
              type="text"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full text-center text-4xl font-black tracking-widest text-slate-900 border-b-2 border-slate-300 focus:border-emerald-500 focus:outline-none pb-4 uppercase"
              required
            />

            <button
              type="submit"
              disabled={loading || placa.length < 5}
              className="w-full rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50"
            >
              {loading ? 'Buscando…' : 'Buscar Placa'}
            </button>
          </form>
        ) : vehiculo.activeSession ? (
          /* VISTA SALIDA */
          <div className="space-y-6 text-center">
            <h2 className="text-2xl font-bold text-slate-900">Salida de Vehículo</h2>
            <p className="text-3xl font-black text-slate-700 tracking-widest">{vehiculo.plate}</p>
            
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-sm text-slate-500">Tiempo de estadía</p>
              <p className="text-2xl font-bold text-slate-900">{vehiculo.diffMins} minutos</p>
            </div>

            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 mb-4">
              <p className="text-sm text-emerald-600 font-medium">Total a cobrar</p>
              <p className="text-4xl font-black text-emerald-700">${recibo.total.toLocaleString('es-CO')}</p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => confirmarSalida(recibo.total, 'cash')}
                disabled={loading}
                className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? 'Procesando…' : `Cobrar $${recibo.total.toLocaleString('es-CO')} y dar Salida`}
              </button>

              <button
                onClick={() => confirmarSalida(0, 'free')}
                disabled={loading}
                className="w-full rounded-xl bg-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-50"
              >
                {loading ? 'Procesando…' : 'Dar Salida sin Cobro (Residente/Exento)'}
              </button>
            </div>
          </div>
        ) : (
          /* VISTA ENTRADA */
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">Registrar Entrada</h2>
              <p className="text-3xl font-black text-slate-700 tracking-widest mt-2">{vehiculo.plate}</p>
            </div>

            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Torre</span>
                <select 
                  value={torre} 
                  onChange={(e) => setTorre(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                >
                  <option value="Torre A">Torre A</option>
                  <option value="Torre B">Torre B</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Apartamento</span>
                <input
                  type="text"
                  value={apto}
                  onChange={(e) => setApto(e.target.value)}
                  placeholder="Ej: 101"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre del Conductor</span>
                <input
                  type="text"
                  value={conductor}
                  onChange={(e) => setConductor(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Documento del Conductor</span>
                <input
                  type="text"
                  value={docConductor}
                  onChange={(e) => setDocConductor(e.target.value)}
                  placeholder="Ej: 12345678"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                  required
                />
              </label>
            </div>

            {/* BOTÓN BONITO PARA TOMAR LA FOTO */}
            <div>
              <span className="text-sm font-medium text-slate-700 block mb-2">Foto del Vehículo (Placa)</span>
              <label className="flex items-center justify-center w-full h-24 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl appearance-none cursor-pointer hover:border-[#1E3A5F] focus:outline-none">
                <span className="flex items-center space-x-2">
                  <span className="text-3xl">📸</span>
                  <span className="font-medium text-slate-600">
                    {fotoVehiculo ? '✅ Foto capturada (Toca para cambiar)' : 'Toca aquí para tomar la foto'}
                  </span>
                </span>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  onChange={(e) => setFotoVehiculo(e.target.files?.[0] || null)} 
                  className="hidden" 
                  required 
                />
              </label>
            </div>

            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-blue-800 text-sm">
              El vehículo será asociado a esta unidad. El residente asumirá el cobro si aplica.
            </div>

            <button
              onClick={confirmarEntrada}
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Registrando…' : 'Dar Entrada al Vehículo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}