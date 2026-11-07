import 'server-only';

import { createClient } from '@supabase/supabase-js';

type SupabaseAdminClient = ReturnType<typeof createClient>;

let adminClient: SupabaseAdminClient | null = null;

function getAdminClient(): SupabaseAdminClient {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.'
    );
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

export const supabaseAdmin: any = new Proxy({} as SupabaseAdminClient, {
  get(_target, property) {
    const client = getAdminClient();
    const value = Reflect.get(client, property, client);

    return typeof value === 'function'
      ? value.bind(client)
      : value;
  },
});