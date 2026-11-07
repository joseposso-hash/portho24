'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export default function ConfirmarInvitacionPage() {
  const router = useRouter();
  const [mensaje, setMensaje] = useState('Validando tu enlace...');

  useEffect(() => {
    let cancelado = false;

    async function confirmar() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash');
        const hashParams = new URLSearchParams(url.hash.substring(1));

        const hashError = hashParams.get('error_description');
        if (hashError) {
          throw new Error(hashError);
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const tipo = (url.searchParams.get('type') || 'invite') as EmailOtpType;

          const tiposPermitidos: EmailOtpType[] = [
            'invite',
            'recovery',
            'signup',
            'magiclink',
            'email_change',
            'email',
          ];

          if (!tiposPermitidos.includes(tipo)) {
            throw new Error('El tipo de enlace no es válido.');
          }

          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: tipo,
          });

          if (error) throw error;
        } else {
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) throw error;
          }
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!data.session) {
          throw new Error(
            'No se pudo validar el enlace. Solicita que te envíen uno nuevo.'
          );
        }

        if (!cancelado) {
          router.replace('/actualizar-clave');
        }
      } catch (error) {
        if (!cancelado) {
          setMensaje(
            error instanceof Error
              ? error.message
              : 'No fue posible validar el enlace.'
          );
        }
      }
    }

    confirmar();

    return () => {
      cancelado = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">
          Portho 24
        </h1>
        <p className="text-slate-600">{mensaje}</p>

        {mensaje !== 'Validando tu enlace...' && (
          <a
            href="/login"
            className="mt-6 inline-block font-semibold text-blue-800"
          >
            Ir al inicio de sesión
          </a>
        )}
      </div>
    </main>
  );
}
