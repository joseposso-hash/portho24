'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export default function ConfirmarInvitacionPage() {
  const router = useRouter();
  const [mensaje, setMensaje] = useState('Validando tu invitación...');

  useEffect(() => {
    let ejecutado = false;

    async function confirmar() {
      if (ejecutado) return;
      ejecutado = true;

      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash');
        const type = (url.searchParams.get('type') || 'invite') as EmailOtpType;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          throw new Error('No se pudo validar la invitación. Solicita que te envíen un nuevo enlace.');
        }

        router.replace('/actualizar-clave');
      } catch (error) {
        setMensaje(
          error instanceof Error
            ? error.message
            : 'No fue posible validar la invitación.'
        );
      }
    }

    confirmar();
    return () => {
      ejecutado = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Portho 24</h1>
        <p className="text-slate-600">{mensaje}</p>
        {mensaje !== 'Validando tu invitación...' && (
          <a href="/login" className="mt-6 inline-block font-semibold text-blue-800">
            Ir al inicio de sesión
          </a>
        )}
      </div>
    </main>
  );
}
