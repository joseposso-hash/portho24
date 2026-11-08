import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomBytes, randomInt, createCipheriv, createDecipheriv } from 'node:crypto';
import { supabaseAdmin } from '../../../lib/supabase-admin';

export type PackageProfile = {
  id: string;
  tenant_id: string;
  role: string;
  unit_id: string | null;
  is_active: boolean;
};

export async function authorizePackageUser(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return { error: 'Sesión no válida.', status: 401 as const };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { error: 'Configuración del servidor incompleta.', status: 500 as const };

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return { error: 'Sesión no válida o vencida.', status: 401 as const };

  const { data: profile, error } = await client.from('users')
    .select('id, tenant_id, role, unit_id, is_active')
    .eq('id', auth.user.id).maybeSingle();

  if (error || !profile || profile.is_active !== true || !profile.tenant_id) {
    return { error: 'Usuario inactivo o sin conjunto asignado.', status: 403 as const };
  }
  return { user: auth.user, profile: profile as PackageProfile };
}

function keyFromEnv(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`Falta configurar ${name} en el servidor.`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error(`${name} debe contener una clave base64 de 32 bytes.`);
  return key;
}

export function createPackagePin() {
  const pin = String(randomInt(100000, 1000000));
  const digest = createHmac('sha256', keyFromEnv('PACKAGE_PIN_HMAC_KEY')).update(pin, 'utf8').digest('hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromEnv('PACKAGE_PIN_ENCRYPTION_KEY'), iv);
  const ciphertext = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  return {
    pin,
    digest,
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function digestPackagePin(pin: string) {
  return createHmac('sha256', keyFromEnv('PACKAGE_PIN_HMAC_KEY')).update(pin, 'utf8').digest('hex');
}

export function decryptPackagePin(ciphertext: string, iv: string, authTag: string) {
  const decipher = createDecipheriv('aes-256-gcm', keyFromEnv('PACKAGE_PIN_ENCRYPTION_KEY'), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export { supabaseAdmin };
