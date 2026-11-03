'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';

export default function ScanPage() {
  const router = useRouter();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null);

  const startScanner = async () => {
    setErrorMsg(null);
    setIsScanning(true);
    
    // Pequeño delay para asegurar que el div esté renderizado
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode("reader");
        setScanner(html5QrCode);

        await html5QrCode.start(
          { facingMode: "environment" }, // Usa la cámara trasera si está en celular
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            // Al leer el QR, detenemos la cámara
            html5QrCode.stop();
            setIsScanning(false);
            setScanResult(decodedText);
            setErrorMsg(null);

            // Validar en Supabase
            const { data, error } = await supabase
              .from('visits')
              .select('id, status, visitors(full_name)')
              .eq('id', decodedText)
              .single();

            if (error || !data) {
              setErrorMsg('Código QR inválido o no existe.');
              setScanResult(null);
              return;
            }

            if (data.status === 'checked_in') {
              setErrorMsg('Esta visita ya fue registrada anteriormente.');
              setScanResult(null);
              return;
            }

            // Marcar como checked_in
            await supabase
              .from('visits')
              .update({ status: 'checked_in', check_in_at: new Date().toISOString() })
              .eq('id', data.id);
            
            setScanResult('success');
            setErrorMsg(`¡Bienvenido, ${(data.visitors as any).full_name}! Entrada registrada.`);
          },
          (errorMessage) => {
            // Errores de escaneo continuo (ignorar)
          }
        );
      } catch (err: any) {
        console.error(err);
        setErrorMsg("No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
        setIsScanning(false);
      }
    }, 100);
  };

  const resetScanner = async () => {
    if (scanner) {
      try { await scanner.stop(); } catch (e) {}
    }
    setScanResult(null);
    setErrorMsg(null);
    setIsScanning(false);
    setScanner(null);
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
        
        {/* Pantalla de Éxito */}
        {scanResult === 'success' && (
          <div className="absolute inset-0 bg-emerald-600 flex flex-col items-center justify-center p-6 text-center text-white z-50">
            <span className="text-6xl mb-4">✅</span>
            <h2 className="text-2xl font-bold mb-2">¡Acceso Permitido!</h2>
            <p className="text-emerald-100 mb-8">{errorMsg}</p>
            <button onClick={resetScanner} className="rounded-xl bg-white text-emerald-700 px-6 py-3 font-bold w-full">
              Escanear otro
            </button>
          </div>
        )}

        {/* Pantalla de Error */}
        {!scanResult && errorMsg && (
          <div className="absolute inset-0 bg-red-600 flex flex-col items-center justify-center p-6 text-center text-white z-50">
            <span className="text-6xl mb-4">❌</span>
            <h2 className="text-2xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-red-100 mb-8">{errorMsg}</p>
            <button onClick={resetScanner} className="rounded-xl bg-white text-red-700 px-6 py-3 font-bold w-full">
              Reintentar
            </button>
          </div>
        )}

        {/* Escáner o Botón de Inicio */}
        {!scanResult && !errorMsg && (
          <>
            <div id="reader" className={`w-full max-w-[300px] ${isScanning ? 'block' : 'hidden'}`}></div>
            
            {!isScanning && (
              <div className="text-center space-y-6">
                <div className="text-6xl mb-4">📸</div>
                <h2 className="text-xl font-bold text-slate-800">Cámara apagada</h2>
                <p className="text-sm text-slate-500">Presiona el botón para encender la cámara y escanear el código QR del visitante.</p>
                <button 
                  onClick={startScanner}
                  className="rounded-xl bg-[#1E3A5F] text-white px-8 py-4 font-bold text-lg hover:bg-[#152945] transition w-full"
                >
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