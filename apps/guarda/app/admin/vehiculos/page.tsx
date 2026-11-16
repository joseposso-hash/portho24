'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import EvidenceImage from '../../components/EvidenceImage';
import { formatUnitLabel, resolveHousingModel } from '../../lib/tenant-config';

export default function AdminVehiculos() {
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');

  useEffect(() => {
    cargar();
  }, [fechaFiltro]);

  async function cargar() {
    setLoading(true);
    setErrorMsg('');

    let query = supabase
      .from('parking_sessions')
      .select('*, vehicles(plate)')
      .order('check_in_at', { ascending: false })
      .limit(100);

    if (fechaFiltro) {
      const inicio = `${fechaFiltro}T00:00:00`;
      const fin = `${fechaFiltro}T23:59:59`;
      query = query.gte('check_in_at', inicio).lte('check_in_at', fin);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error cargando historial de vehículos:', error);
      setErrorMsg('No fue posible cargar el historial de vehículos.');
    } else {
      const sessions = data || [];
      const unitIds = Array.from(new Set(sessions.map((row: any) => row.unit_id).filter(Boolean)));
      let unitsById = new Map<string, any>();

      if (unitIds.length) {
        const { data: unitRows, error: unitsError } = await supabase
          .from('units')
          .select('id, code, tower_id')
          .in('id', unitIds);

        if (unitsError) {
          console.error('Error cargando viviendas del historial:', unitsError);
        } else {
          const towerIds = Array.from(new Set((unitRows || []).map((unit: any) => unit.tower_id).filter(Boolean)));
          let towersById = new Map<string, any>();

          if (towerIds.length) {
            const { data: towerRows, error: towersError } = await supabase
              .from('towers')
              .select('id, name')
              .in('id', towerIds);
            if (towersError) console.error('Error cargando torres del historial:', towersError);
            towersById = new Map((towerRows || []).map((tower: any) => [tower.id, tower]));
          }

          unitsById = new Map((unitRows || []).map((unit: any) => [unit.id, {
            ...unit,
            towers: towersById.get(unit.tower_id) || null,
          }]));
        }
      }

      setVehiculos(sessions.map((row: any) => ({
        ...row,
        units: row.unit_id ? unitsById.get(row.unit_id) || null : null,
      })));
    }
    setLoading(false);
  }

  const filtrados = vehiculos.filter((v) =>
    (v.vehicles as any)?.plate?.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.notes?.toLowerCase().includes(busqueda.toLowerCase()) ||
    getDatos(v).destino.toLowerCase().includes(busqueda.toLowerCase())
  );

  function getDatos(v: any) {
    const notes = v.notes || '';
    let conductor = '-';
    let destino = 'No especificado';

    const matchVisita = notes.match(/Visita:\s*([^-]+)/i);
    const matchConductor = notes.match(/Conductor:\s*([^-]+)/i);
    const matchDestino = notes.match(/Destino:\s*(.+?)(?:\s+-\s+Doc:|$)/i);

    if (matchVisita) conductor = matchVisita[1].trim();
    else if (matchConductor) conductor = matchConductor[1].trim();
    if (matchDestino) destino = matchDestino[1].trim();

    // La unidad vinculada a la sesión es la fuente de verdad del destino.
    // Evita confundir, por ejemplo, el apartamento 107 con la casa 107.
    const unit = Array.isArray(v.units) ? v.units[0] : v.units;
    if (unit?.code) {
      const towerRelation = unit.towers;
      const tower = Array.isArray(towerRelation) ? towerRelation[0] : towerRelation;
      const model = resolveHousingModel(v.tenant_id);
      destino = formatUnitLabel(unit.code, tower?.name, model);
    }

    return { conductor, destino };
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Historial de Vehículos</h1>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
          <input
            type="text"
            placeholder="Buscar por placa, conductor o destino..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filtrar fecha:</span>
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-4 py-3">Foto</th>
                <th className="px-4 py-3">Placa</th>
                <th className="px-4 py-3">Conductor</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Cobro</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Hora Ingreso</th>
                <th className="px-4 py-3">Hora Salida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center">Cargando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">No hay vehículos registrados.</td></tr>
              ) : (
                filtrados.map((v) => {
                  const d = getDatos(v);
                  return (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {v.photo_url ? (
                          <EvidenceImage src={v.photo_url} alt="Vehículo" className="h-10 w-10 object-cover rounded shadow-sm" />
                        ) : (
                          <div className="h-10 w-10 bg-slate-100 rounded flex items-center justify-center text-[10px] text-slate-400 border border-slate-200">N/A</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{(v.vehicles as any)?.plate || '-'}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          {v.driver_photo_url && (
                            <EvidenceImage src={v.driver_photo_url} alt="Conductor" className="h-6 w-6 object-cover rounded-full border border-slate-200" />
                          )}
                          {d.conductor}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#1E3A5F]">{d.destino}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">${(v.amount_paid || 0).toLocaleString('es-CO')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${v.status === 'active' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>
                          {v.status === 'active' ? 'Adentro' : 'Salió'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {v.check_in_at ? new Date(v.check_in_at).toLocaleTimeString('es-CO') : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {v.check_out_at ? new Date(v.check_out_at).toLocaleTimeString('es-CO') : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
