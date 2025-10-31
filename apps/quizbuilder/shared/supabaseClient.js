let clientPromise = null;

class SupabaseConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SupabaseConfigurationError';
  }
}

function resolveConfig() {
  if (typeof window === 'undefined') {
    return { url: null, anonKey: null, options: {} };
  }

  const config = window.__QB_SUPABASE_CONFIG__ || window.__SUPABASE_CONFIG__;
  if (!config) {
    return { url: null, anonKey: null, options: {} };
  }

  return {
    url: config.url || null,
    anonKey: config.anonKey || null,
    options: config.options || {},
  };
}

async function loadSupabaseLibrary() {
  // Use esm.sh to provide an ESM compatible build without bundling.
  const module = await import(
    'https://esm.sh/@supabase/supabase-js@2.45.1?bundle'
  );
  if (!module?.createClient) {
    throw new Error('Supabase library did not expose createClient.');
  }
  return module;
}

export async function getSupabaseClient() {
  console.log('[SupabaseClient] Getting client instance...');
  if (clientPromise) {
    console.log('[SupabaseClient] Returning existing client promise');
    return clientPromise;
  }

  const { url, anonKey, options } = resolveConfig();
  console.log('[SupabaseClient] Config resolved:', {
    url: url ? 'present' : 'missing',
    hasAnonKey: !!anonKey,
    options,
  });

  if (!url || !anonKey) {
    const error = new SupabaseConfigurationError(
      'Supabase configuration missing. Set window.__QB_SUPABASE_CONFIG__ (or __SUPABASE_CONFIG__) with url and anonKey before loading Quiz Builder.'
    );
    console.error('[SupabaseClient] Configuration error:', error.message);
    clientPromise = Promise.reject(error);
    clientPromise.catch(() => {});
    throw error;
  }

  console.log('[SupabaseClient] Creating new client...');
  clientPromise = (async () => {
    try {
      console.log('[SupabaseClient] Loading Supabase library...');
      const lib = await loadSupabaseLibrary();
      console.log('[SupabaseClient] Library loaded, creating client...');
      const defaultOptions = {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'an.supabase.auth',
        },
      };
      const mergedOptions = {
        ...defaultOptions,
        ...(options || {}),
        auth: {
          ...defaultOptions.auth,
          ...(options?.auth || {}),
        },
      };

      const client = lib.createClient(url, anonKey, mergedOptions);
      console.log('[SupabaseClient] Client created successfully');
      return client;
    } catch (error) {
      console.error('[SupabaseClient] Failed to create client:', error);
      throw new Error(`Failed to initialise Supabase client: ${error.message}`);
    }
  })();

  return clientPromise;
}

export function resetSupabaseClient() {
  clientPromise = null;
}

export { SupabaseConfigurationError };
