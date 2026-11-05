'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('guardia@portho.demo');
  const [password, setPassword] = useState('demo1234');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    
    // 1. Iniciar sesión
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    // 2. Consultar el rol del usuario
    if (authData.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      // 3. Redirigir según el rol
      if (profile?.role === 'resident') {
        router.push('/residente');
      } else {
        router.push('/'); // Guardias y Admins van al Home
      }
    }
    
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1E3A5F] text-3xl">🛡️</div>
          <h1 className="text-2xl font-bold text-slate-900">Portho 24</h1>
          <p className="text-sm text-slate-500">Tu portería, en orden</p>
        </div>

        {err && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <label className="mb-4 block">
          <span className="text-sm font-medium text-slate-700">Correo</span>
          <input 
            type="email" 
            required 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" 
          />
        </label>

        <label className="mb-6 block">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input 
            type="password" 
            required 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900" 
          />
        </label>

        <button 
          disabled={loading} 
          className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
        
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: guardia@portho.demo / demo1234
        </p>
      </form>
    </div>
  );
}