'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';

export default function ScanPage() {
  const router = useRouter();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null);
  
  const [visitaEncontrada, setVisitaEncontrada] = useState<any>(null);
  const [fotoVisitante, setFotoVisitante] = useState<File | null>(null);
  const [fotoVehiculo, setFotoVehiculo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  
  const [vieneEnVehiculo, setVieneEnVehiculo] = useState(false);
  const [placaVehiculo, setPlacaVehiculo] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState('car');

  const startScanner = async () => {
    setErrorMsg(null);
    setIsScanning(true);
    setVisitaEncontrada(null);
    setFotoVisitante(null);
    setFotoVehiculo(null);
    setScanResult(null);
    setVieneEnVehiculo(false);
    setPlacaVehiculo('');
    
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode("reader");
        setScanner(html5QrCode);

        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            html5QrCode.stop();
            setIsScanning(false);

            const { data, error } = await supabase
              .from('visits')
              .select('id, status, expires_at, created_at, visitors(full_name, doc_number), units(id, code, towers(id, name, tenant_id))')
              .eq('id', decodedText)
              .single();

            if (error || !data) {
              setErrorMsg('Código QR inválido o no existe.');
              return;
            }

            if (data.status === 'denied' || data.status === 'expired') {
              setErrorMsg('Esta visita ha sido cancelada o ha expirado.');
              return;
            }

            if (data.expires_at && new Date(data.expires_at) < new Date()) {
              setErrorMsg('El código QR ha expirado.');
              return;
            }

            if (data.created_at) {
              const fechaCreacion = new Date(data.created_at);
              const hoy = new Date();
              if (fechaCreacion.getDate() !== hoy.getDate() || fechaCreacion.getMonth() !== hoy.getMonth()) {
                await supabase.from('visits').update({ status: 'expired' }).eq('id', data.id);
                setErrorMsg('Este código QR es de un día anterior y ya no es válido.');
                return;
              }
            }

            if (data.status === 'checked_in') {
              setErrorMsg('Esta visita ya fue registrada anteriormente.');
              return;
            }

            setVisitaEncontrada(data);
          },
          (errorMessage) => { /* ignorar */ }
        );
      } catch (err: any) {
        setErrorMsg("No se pudo acceder a la cámara.");
        setIsScanning(false);
      }
    }, 100);
  };

  const confirmarIngreso = async () => {
    if (!visitaEncontrada || !fotoVisitante) {
      setErrorMsg('Debes tomar la foto del visitante.');
      return;
    }
    if (vieneEnVehiculo && (!placaVehiculo || !fotoVehiculo)) {
      setErrorMsg('Debes ingresar la placa y tomar la foto del vehículo.');
      return;
    }

    setSubiendo(true);
    setErrorMsg(null);

    try {
      const tenantId = (visitaEncontrada.units as any).towers.tenant_id;

      // 1. Subir foto del visitante
      const fileExtVis = fotoVisitante.name.split('.').pop();
      const fileNameVis = `visitantes/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtVis}`;
      const { error: errVis } = await supabase.storage.from('evidences').upload(fileNameVis, fotoVisitante, { contentType: fotoVisitante.type });
      if (errVis) throw new Error("Error subiendo foto del visitante: " + errVis.message);
      
      const { data: { publicUrl: urlVis } } = supabase.storage.from('evidences').getPublicUrl(fileNameVis);

      // 2. Actualizar la visita
      const { error: visitError } = await supabase.from('visits').update({ 
        status: 'checked_in', 
        check_in_at: new Date().toISOString(),
        photo_url: urlVis
      }).eq('id', visitaEncontrada.id);

      if (visitError) throw new Error("Error actualizando visita: " + visitError.message);

      // 3. Registrar el vehículo (si aplica)
      if (vieneEnVehiculo && placaVehiculo && fotoVehiculo) {
        
        // Subir foto del vehículo
        const fileExtVeh = fotoVehiculo.name.split('.').pop();
        const fileNameVeh = `vehiculos/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtVeh}`;
        const { error: errVeh } = await supabase.storage.from('evidences').upload(fileNameVeh, fotoVehiculo, { contentType: fotoVehiculo.type });
        if (errVeh) throw new Error("Error subiendo foto del vehículo: " + errVeh.message);
        
        const { data: { publicUrl: urlVeh } } = supabase.storage.from('evidences').getPublicUrl(fileNameVeh);

        // Buscar o crear vehículo
        let { data: veh } = await supabase.from('vehicles').select('*').eq('plate', placaVehiculo.toUpperCase()).eq('tenant_id', tenantId).single();
        
                if (veh) {
          const { error: errSession } = await supabase.from('parking_sessions').insert({
            tenant_id: tenantId,
            vehicle_id: veh.id,
            visit_id: visitaEncontrada.id,
            unit_id: (visitaEncontrada.units as any).id,
            status: 'active',
            check_in_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            // 🔥 AQUÍ ESTÁ LA CORRECCIÓN: Usamos .code (la casa) en lugar de .name (el conjunto)
            notes: `Conductor: ${(visitaEncontrada.visitors as any).full_name} - Destino: ${(visitaEncontrada.units as any).code}`,
            photo_url: urlVeh
          });

          if (errSession) throw errSession;
        }
      }

      setScanResult('success');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setErrorMsg(null);
    setVisitaEncontrada(null);
    setFotoVisitante(null);
    setFotoVehiculo(null);
    setIsScanning(false);
    setVieneEnVehiculo(false);
    setPlacaVehiculo('');
    if (scanner) { try { scanner.stop(); } catch (e) {} }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center justify-center text-white">
      <header className="absolute top-0 left-0 w-full p-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">📷 Escanear QR</h1>
        <button onClick={() => router.push('/')} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
          ← Volver
        </button>
      </header>

      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl text-slate-900 relative min-h-[400px] flex flex-col items-center justify-center p-4">
        
        {scanResult === 'success' && (
          <div className="absolute inset-0 bg-emerald-600 flex flex-col items-center justify-center p-6 text-center text-white z-50">
            <span className="text-6xl mb-4">✅</span>
            <h2 className="text-2xl font-bold mb-2">¡Acceso Permitido!</h2>
            <p className="text-emerald-100 mb-8">El ingreso ha sido registrado correctamente.</p>
            <button onClick={resetScanner} className="rounded-xl bg-white text-emerald-700 px-6 py-3 font-bold w-full">
              Escanear otro
            </button>
          </div>
        )}

        {!scanResult && errorMsg && !visitaEncontrada && (
          <div className="absolute inset-0 bg-red-600 flex flex-col items-center justify-center p-6 text-center text-white z-50">
            <span className="text-6xl mb-4">❌</span>
            <h2 className="text-2xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-red-100 mb-8">{errorMsg}</p>
            <button onClick={resetScanner} className="rounded-xl bg-white text-red-700 px-6 py-3 font-bold w-full">
              Reintentar
            </button>
          </div>
        )}

        {visitaEncontrada && !scanResult && (
          <div className="w-full p-4 space-y-4 overflow-y-auto max-h-[80vh]">
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-800">Visita Válida</h2>
              <p className="text-sm text-slate-500 mt-1">
                {(visitaEncontrada.visitors as any).full_name} → {(visitaEncontrada.units as any).towers.name} - {(visitaEncontrada.units as any).code}
              </p>
            </div>

            <div>
              <label className="flex items-center justify-center w-full h-20 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                <span className="flex flex-col items-center space-y-1">
                  <span className="text-2xl">🧑</span>
                  <span className="font-medium text-slate-600 text-xs">
                    {fotoVisitante ? '✅ Foto visitante capturada' : 'Tomar foto del visitante'}
                  </span>
                </span>
                <input type="file" accept="image/*" capture="user" onChange={(e) => setFotoVisitante(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={vieneEnVehiculo} onChange={(e) => setVieneEnVehiculo(e.target.checked)} className="w-4 h-4 text-[#1E3A5F] rounded focus:ring-[#1E3A5F]" />
                <span className="text-sm font-medium text-slate-700">El visitante viene en vehículo</span>
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

                  <label className="flex items-center justify-center w-full h-20 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:border-[#1E3A5F]">
                    <span className="flex flex-col items-center space-y-1">
                      <span className="text-2xl">🚗</span>
                      <span className="font-medium text-slate-600 text-xs">
                        {fotoVehiculo ? '✅ Foto vehículo capturada' : 'Tomar foto del vehículo'}
                      </span>
                    </span>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoVehiculo(e.target.files?.[0] || null)} className="hidden" />
                  </label>
                </div>
              )}
            </div>

            {errorMsg && <p className="text-red-500 text-xs text-center font-medium bg-red-50 p-2 rounded">{errorMsg}</p>}

            <div className="flex gap-3 mt-2">
              <button onClick={resetScanner} className="flex-1 rounded-xl bg-slate-200 py-3 font-semibold text-slate-700">Cancelar</button>
              <button onClick={confirmarIngreso} disabled={subiendo} className="flex-1 rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white disabled:opacity-50">
                {subiendo ? 'Guardando...' : 'Autorizar Ingreso'}
              </button>
            </div>
          </div>
        )}

        {!scanResult && !errorMsg && !visitaEncontrada && (
          <>
            <div id="reader" className={`w-full max-w-[300px] ${isScanning ? 'block' : 'hidden'}`}></div>
            {!isScanning && (
              <div className="text-center space-y-6">
                <div className="text-6xl mb-4">📸</div>
                <h2 className="text-xl font-bold text-slate-800">Cámara apagada</h2>
                <p className="text-sm text-slate-500">Presiona el botón para encender la cámara y escanear el código QR.</p>
                <button onClick={startScanner} className="rounded-xl bg-[#1E3A5F] text-white px-8 py-4 font-bold text-lg hover:bg-[#152945] transition w-full">
                  Encender Cámara
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}