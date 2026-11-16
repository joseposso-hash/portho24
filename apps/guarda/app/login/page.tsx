'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setNotice(null);

    const { data: authData, error } =
      await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      setErr('Correo o contraseña incorrectos. Verifica los datos o recupera tu contraseña.');
      setLoading(false);
      return;
    }

    if (authData.user) {
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        setErr('No fue posible consultar tu perfil. Contacta al administrador.');
        setLoading(false);
        return;
      }

      router.replace(profile?.role === 'resident' ? '/residente' : '/');
    }

    setLoading(false);
  }

  async function recuperarClave() {
    setErr(null);
    setNotice(null);

    if (!email.trim()) {
      setErr('Escribe primero tu correo electrónico.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/confirm`,
      }
    );

    if (error) {
      setErr(error.message);
    } else {
      setNotice('Si el correo está registrado, recibirás un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.');
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1E3A5F] text-3xl">
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Portho 24</h1>
          <p className="text-sm text-slate-500">Tu portería, en orden</p>
        </div>

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {notice}
          </div>
        )}

        <label className="mb-4 block">
          <span className="text-sm font-medium text-slate-700">Correo</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
          />
        </label>

        <label className="mb-2 block">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
          />
        </label>

        <button
          type="button"
          onClick={recuperarClave}
          disabled={loading}
          className="mb-5 text-sm font-semibold text-blue-800 hover:underline disabled:opacity-50"
        >
          ¿Olvidaste tu contraseña?
        </button>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white transition hover:bg-[#152945] disabled:opacity-50"
        >
          {loading ? 'Procesando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
