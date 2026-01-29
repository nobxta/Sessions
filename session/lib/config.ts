const DEFAULT_API_BASE_URL = 'http://localhost:8000';
const BACKEND_URL_STORAGE_KEY = 'backend_url';

let cachedBackendUrl: string | null = null;

function getStoredBackendUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(BACKEND_URL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function getBackendUrl(): Promise<string> {
  if (cachedBackendUrl) {
    return cachedBackendUrl;
  }
  const stored = getStoredBackendUrl();
  const url = stored || process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
  cachedBackendUrl = url;
  return url;
}

export function clearBackendUrlCache() {
  cachedBackendUrl = null;
}

export function getCachedBackendUrl(): string {
  return cachedBackendUrl || getStoredBackendUrl() || process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
}

export function setBackendUrlOverride(url: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (url) localStorage.setItem(BACKEND_URL_STORAGE_KEY, url);
    else localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
  } catch {
    // ignore
  }
  clearBackendUrlCache();
}

export let API_BASE_URL = getCachedBackendUrl();
export let WS_BASE_URL = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');

export async function updateBackendUrl() {
  const url = await getBackendUrl();
  API_BASE_URL = url;
  WS_BASE_URL = url.replace('http://', 'ws://').replace('https://', 'wss://');
}

// No-op: usage stats removed (no Supabase)
export async function trackUsage(_feature: string, _sessionCount: number = 1) {
  // Data is stored on backend locally; no cloud tracking.
}

if (typeof window !== 'undefined') {
  getBackendUrl().then((url) => {
    API_BASE_URL = url;
    WS_BASE_URL = url.replace('http://', 'ws://').replace('https://', 'wss://');
  });
}
