'use client';
export const dynamic = 'force-dynamic';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

export default function VisitantePage() {
  const params = useParams();
  const visitId = params.id as string;

  if (!visitId) return null;

  return (
    <div className="min-h-screen bg-[#1E3A5F] flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Portho 24</h1>
        <p className="text-blue-200">Tu portería, en orden</p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-2xl">
        <h2 className="text-slate-800 font-bold mb-4 text-lg">Pase de Acceso</h2>
        <div className="bg-white p-2 rounded-xl inline-block border-2 border-slate-100">
          <QRCodeSVG value={visitId} size={250} />
        </div>
        <p className="text-slate-500 text-sm mt-6 max-w-[250px] mx-auto">
          Muestra este código al guardia de seguridad para ingresar al conjunto.
        </p>
      </div>

      <p className="mt-8 text-xs text-blue-300">
        Generado por Portho 24
      </p>
    </div>
  );
}