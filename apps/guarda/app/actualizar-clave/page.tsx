'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function ActualizarClavePage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [loading, setLoading] = useState(false);
  const [validando, setValidando] = useState(true);
  const [sesionValida, setSesionValida] = useState(false);

  useEffect(() => {
    async function verificarSesion() {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setMensaje(
          'No hay una invitación o recuperación activa. Inicia sesión o solicita un nuevo enlace.'
        );
        setSesionValida(false);
      } else {
        setSesionValida(true);
      }

      setValidando(false);
    }

    verificarSesion();
  }, []);

  async function guardarClave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensaje('');

    if (password.length < 8) {
      setMensaje('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setMensaje('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setMensaje('Tu enlace ha vencido. Solicita uno nuevo.');
      setSesionValida(false);
      setLoading(false);
      return;
    }

    const { data: updateData, error: updateError } =
      await supabase.auth.updateUser({ password });

    if (updateError || !updateData.user) {
      setMensaje(
        updateError?.message || 'No fue posible guardar la contraseña.'
      );
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', updateData.user.id)
      .single();

    if (profileError) {
      setMensaje(
        'La contraseña se guardó, pero no pudimos consultar tu perfil. Intenta iniciar sesión.'
      );
      setLoading(false);
      return;
    }

    router.replace(profile?.role === 'resident' ? '/residente' : '/');
  }

  if (validando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        Verificando enlace...
      </main>
    );
  }

  if (!sesionValida) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="mb-3 text-2xl font-bold text-slate-900">
            Portho 24
          </h1>
          <p className="text-sm text-amber-800">{mensaje}</p>
          <a
            href="/login"
            className="mt-6 inline-block font-semibold text-blue-800"
          >
            Ir al inicio de sesión
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form
        onSubmit={guardarClave}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="mb-2 text-2xl font-bold text-slate-900">
          Crear contraseña
        </h1>

        <p className="mb-6 text-sm text-slate-500">
          Establece tu contraseña personal para ingresar a Portho 24.
        </p>

        {mensaje && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {mensaje}
          </div>
        )}

        <label className="mb-4 block">
          <span className="text-sm font-medium text-slate-700">
            Nueva contraseña
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
          />
        </label>

        <label className="mb-6 block">
          <span className="text-sm font-medium text-slate-700">
            Confirmar contraseña
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#1E3A5F] py-3 font-semibold text-white hover:bg-[#152945] disabled:opacity-50"
        >
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>

        <a
          href="/login"
          className="mt-5 block text-center text-sm text-slate-500"
        >
          Volver al inicio de sesión
        </a>
      </form>
    </main>
  );
}
