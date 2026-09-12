import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

const supabasePublishableKey =
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

// Security check: Ensure secret/service_role keys are NEVER exposed to browser
const isServiceRoleKey = (key: string): boolean => {
  if (!key) return false;
  return key.toLowerCase().includes('service_role');
};

if (isServiceRoleKey(supabasePublishableKey)) {
  console.error(
    '[Supabase Security Alert] service_role key must NEVER be used on the client-side! Client initialization halted.'
  );
}

export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
    supabasePublishableKey &&
    !isServiceRoleKey(supabasePublishableKey)
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;