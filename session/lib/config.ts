import { supabase } from './supabase';

// Default fallback URL
const DEFAULT_API_BASE_URL = 'http://localhost:8000';

// Get backend URL from Supabase, fallback to env or default
let cachedBackendUrl: string | null = null;

export async function getBackendUrl(): Promise<string> {
  // Return cached value if available
  if (cachedBackendUrl) {
    return cachedBackendUrl;
  }

  // Only try Supabase if credentials are configured
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      // Try to get from Supabase
      const { data, error } = await supabase
        .from('backend_url')
        .select('url')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data?.url) {
        cachedBackendUrl = data.url;
        return data.url;
      }
    } catch (err) {
      console.warn('Failed to fetch backend URL from Supabase:', err);
    }
  }

  // Fallback to environment variable or default
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
  cachedBackendUrl = envUrl;
  return envUrl;
}

// Clear cache when URL is updated
export function clearBackendUrlCache() {
  cachedBackendUrl = null;
}

// For synchronous access (will use cached or default)
export function getCachedBackendUrl(): string {
  return cachedBackendUrl || process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
}

// Initialize API_BASE_URL (will be updated async)
export let API_BASE_URL = getCachedBackendUrl();
export let WS_BASE_URL = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');

// Update API_BASE_URL when backend URL changes
export async function updateBackendUrl() {
  const url = await getBackendUrl();
  API_BASE_URL = url;
  WS_BASE_URL = url.replace('http://', 'ws://').replace('https://', 'wss://');
}

// Track usage stats
export async function trackUsage(feature: string, sessionCount: number = 1) {
  try {
    // Only track if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return; // Silently skip if Supabase not configured
    }
    
    await supabase
      .from('usage_stats')
      .insert({
        feature,
        session_count: sessionCount,
        timestamp: new Date().toISOString(),
      });
  } catch (err) {
    console.warn('Failed to track usage stats:', err);
  }
}

// Initialize backend URL on module load (client-side only)
if (typeof window !== 'undefined') {
  getBackendUrl().then((url) => {
    API_BASE_URL = url;
    WS_BASE_URL = url.replace('http://', 'ws://').replace('https://', 'wss://');
  });
}
