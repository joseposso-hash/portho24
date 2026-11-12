'use client';

import { supabase } from './supabase';

export type EvidenceType = 'paquete' | 'visitante' | 'conductor' | 'vehiculo';

export async function uploadEvidence(file: File, type: EvidenceType): Promise<string> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error('La sesión expiró. Inicia sesión nuevamente.');

  const form = new FormData();
  form.append('file', file);
  form.append('type', type);

  const response = await fetch('/api/evidencias/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });

  const result = await response.json();
  if (!response.ok || !result.success || !result.ref) {
    throw new Error(result.error || 'No fue posible cargar la fotografía.');
  }

  return result.ref as string;
}

export async function resolveEvidence(ref: string): Promise<string> {
  if (!ref.startsWith('storage://evidences-private/')) return ref;

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error('Sesión vencida.');

  const response = await fetch('/api/evidencias/leer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ref }),
  });

  const result = await response.json();
  if (!response.ok || !result.url) throw new Error(result.error || 'No se pudo consultar la fotografía.');
  return result.url as string;
}
