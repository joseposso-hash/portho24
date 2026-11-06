'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function VisitasPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Solo necesitamos las casas (units)
  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');
  const [unitSearch, setUnitSearch] = useState('');

  const [vieneEnVehiculo, setVieneEnVehiculo] = useState(false);
  const [placaVehiculo, setPlacaVehiculo] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState('car');
  const [fotoVisitante, setFotoVisitante] = useState<File | null>(null);
  const [fotoVehiculo, setFotoVehiculo] = useState<File | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
      
      if (profile) {
        setTenantId(profile.tenant_id);
        // Cargar TODAS las casas del cliente
        const { data } = await supabase
          .from('units')
          .select('id, code')
          .order('code');
        if (data) setUnits(data);
      }
    }
    init();
  }, []);

  async function registrarVisita(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre || !documento || !unitId || !tenantId) {
      setErrorMsg('Por favor, llena los datos y selecciona la casa.');
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: visitor, error: errVis } = await supabase
        .from('visitors')
        .insert({ tenant_id: tenantId, full_name: nombre, doc_number: documento })
        .select().single();

      if (errVis) throw errVis;

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

      const { data: visita, error: errVisita } = await supabase
        .from('visits')
        .insert({
          tenant_id: tenantId,
          visitor_id: visitor.id,
          host_user_id: (await supabase.auth.getUser()).data.user?.id,
          unit_id: unitId,
          status: 'checked_in',
          check_in_at: new Date().toISOString(),
          photo_url: urlVisitante
        })
        .select().single();

      if (errVisita) throw errVisita;

      if (vieneEnVehiculo && placaVehiculo && fotoVehiculo) {
        const fileExtVeh = fotoVehiculo.name.split('.').pop();
        const fileNameVeh = `vehiculos/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtVeh}`;
        const { error: errVeh } = await supabase.storage.from('evidences').upload(fileNameVeh, fotoVehiculo, { contentType: fotoVehiculo.type });
        if (errVeh) throw errVeh;
        const { data: { publicUrl: urlVeh } } = supabase.storage.from('evidences').getPublicUrl(fileNameVeh);

        let { data: veh } = await supabase.from('vehicles').select('*').eq('plate', placaVehiculo.toUpperCase()).eq('tenant_id', tenantId).single();
        
        if (!veh) {
          const { data: newVeh, error: errNewVeh } = await supabase.from('vehicles').insert({ tenant_id: tenantId, plate: placaVehiculo.toUpperCase(), type: tipoVehiculo }).select().single();
          if (errNewVeh) throw errNewVeh;
          veh = newVeh;
        }

                if (veh) {
          await supabase.from('parking_sessions').insert({
            tenant_id: tenantId,
            vehicle_id: veh.id,
            visit_id: visita.id,
            unit_id: unitId,
            status: 'active',
            check_in_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            // ⚠️ ESTE ES EL CAMBIO CLAVE:
            notes: `Conductor: ${nombre} - Doc: ${documento} - Destino: ${unitSearch}`,
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
        </div>
        <button onClick={() => router.push('/')} className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-50">← Volver</button>
      </header>

      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        {!success ? (
          <form onSubmit={registrarVisita} className="space-y-5">
            {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Nombre del visitante</span>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" required />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Documento de identidad</span>
              <input type="text" value={documento} onChange={(e) => setDocumento(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" required />
            </label>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <p className="text-sm font-bold text-slate-800">📍 Destino de la visita</p>
              
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Casa / Unidad</span>
                <input 
                  type="text" 
                  list="lista-casas-visita" 
                  value={unitSearch} 
                  onChange={(e) => {
                    setUnitSearch(e.target.value);
                    const found = units.find(u => u.code.toLowerCase() === e.target.value.toLowerCase());
                    setUnitId(found ? found.id : '');
                  }} 
                  placeholder="Escribe la casa (ej. 125)" 
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" 
                  required 
                />
                <datalist id="lista-casas-visita">
                  {units.map(u => <option key={u.id} value={u.code} />)}
                </datalist>
              </label>
            </div>

            <div>
              <span className="text-sm font-medium text-slate-700 block mb-1">Foto del Visitante</span>
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
            <button onClick={() => { setSuccess(false); setNombre(''); setDocumento(''); setUnitId(''); setUnitSearch(''); setVieneEnVehiculo(false); setPlacaVehiculo(''); setFotoVisitante(null); setFotoVehiculo(null); }} className="mt-4 rounded-xl bg-[#1E3A5F] px-6 py-3 font-semibold text-white hover:bg-[#152945]">Registrar otra visita</button>
          </div>
        )}
      </div>
    </div>
  );
}