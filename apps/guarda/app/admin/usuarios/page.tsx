'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [torres, setTorres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Estados para el formulario de nuevo usuario
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [towerId, setTowerId] = useState('');
  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    // 1. Cargar usuarios residentes
    const { data: userData } = await supabase
      .from('users')
      .select('*, units(code, towers(name))')
      .eq('role', 'resident')
      .order('full_name');
    
    // 2. Cargar torres
    const { data: towerData } = await supabase
      .from('towers')
      .select('*')
      .order('name');

    if (userData) setUsuarios(userData);
    if (towerData) setTorres(towerData);
    setLoading(false);
  }

  // Cargar apartamentos cuando se selecciona una torre
  useEffect(() => {
    if (!towerId) {
      setUnits([]);
      setUnitId('');
      return;
    }
    async function cargarUnidades() {
      const { data } = await supabase
        .from('units')
        .select('*')
        .eq('tower_id', towerId)
        .order('code');
      if (data) setUnits(data);
    }
    cargarUnidades();
  }, [towerId]);

  async function crearResidente(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);

    try {
      // 1. Crear el usuario en Auth (Supabase)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: 'demo1234', // Contraseña por defecto para el demo
        email_confirm: true,
      });

      if (authError) throw authError;

      // 2. Insertar el perfil en la tabla pública 'users'
      const { error: profileError } = await supabase.from('users').insert({
        id: authData.user.id,
        tenant_id: '11111111-1111-1111-1111-111111111111',
        role: 'resident',
        full_name: nombre,
        email: email,
        unit_id: unitId,
      });

      if (profileError) throw profileError;

      alert('✅ Residente creado con éxito. Contraseña inicial: demo1234');
      setModalOpen(false);
      setNombre(''); setEmail(''); setTowerId(''); setUnitId('');
      cargarDatos();
      
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Gestión de Residentes</h1>
        <button onClick={() => setModalOpen(true)} className="bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#152945]">
          + Nuevo Residente
        </button>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Unidad Asignada</th>
                <th className="px-6 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Cargando...</td></tr>
              ) : usuarios.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No hay residentes registrados.</td></tr>
              ) : (
                usuarios.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">{user.full_name}</td>
                    <td className="px-6 py-4 text-slate-500">{user.email}</td>
                    <td className="px-6 py-4 font-medium text-[#1E3A5F]">
                      {(user.units as any)?.towers?.name} - {(user.units as any)?.code}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                        Activo
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PARA CREAR USUARIO */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Registrar Nuevo Residente</h2>
            
            <form onSubmit={crearResidente} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre Completo</span>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900" placeholder="Ej: Pedro Pérez" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Correo Electrónico</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900" placeholder="pedro@correo.com" />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Torre</span>
                  <select value={towerId} onChange={(e) => setTowerId(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900">
                    <option value="">Seleccionar...</option>
                    {torres.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Apartamento</span>
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required disabled={!towerId} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 disabled:opacity-50">
                    <option value="">Seleccionar...</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}
                  </select>
                </label>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800">
                La contraseña inicial para el residente será <strong>demo1234</strong>.
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Guardar Residente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}