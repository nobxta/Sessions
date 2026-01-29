'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, CheckCircle2, Settings, Link as LinkIcon, BarChart3, Lock, Database, RefreshCw } from 'lucide-react';
import { clearBackendUrlCache, updateBackendUrl, getCachedBackendUrl, setBackendUrlOverride } from '@/lib/config';

const SETTINGS_PIN = '8523';
const AUTH_KEY = 'settings_authenticated';

export default function SettingsPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalSessions: number;
    totalFeatures: number;
    lastUpdated: string | null;
  }>({
    totalSessions: 0,
    totalFeatures: 0,
    lastUpdated: null,
  });
  const [capturedSessions, setCapturedSessions] = useState<any[]>([]);
  const [isLoadingCaptured, setIsLoadingCaptured] = useState(false);

  useEffect(() => {
    // Check if already authenticated in this session
    const authStatus = sessionStorage.getItem(AUTH_KEY);
    if (authStatus === 'true') {
      setIsAuthenticated(true);
      loadSettings();
      loadStats();
      loadCapturedSessions();
    }
  }, []);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (pin === SETTINGS_PIN) {
      setIsAuthenticated(true);
      sessionStorage.setItem(AUTH_KEY, 'true');
      loadSettings();
      loadStats();
      loadCapturedSessions();
      setPin('');
    } else {
      setPinError('Incorrect PIN. Access denied.');
      setPin('');
    }
  };

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const current = getCachedBackendUrl();
      setBackendUrl(current || envUrl);
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setBackendUrl(process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    // Stats are stored on backend locally; no cloud stats. Keep UI at 0 / N/A.
    setStats({ totalSessions: 0, totalFeatures: 0, lastUpdated: null });
  };

  const loadCapturedSessions = async () => {
    try {
      setIsLoadingCaptured(true);
      const backendUrl = getCachedBackendUrl();
      
      const response = await fetch(`${backendUrl}/api/captured-sessions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch captured sessions');
      }

      const data = await response.json();
      if (data.success) {
        setCapturedSessions(data.sessions || []);
      }
    } catch (err) {
      console.warn('Failed to load captured sessions:', err);
      setCapturedSessions([]);
    } finally {
      setIsLoadingCaptured(false);
    }
  };

  const handleSave = async () => {
    if (!backendUrl.trim()) {
      setError('Please enter a backend URL');
      return;
    }

    // Normalize URL - remove trailing slash
    let normalizedUrl = backendUrl.trim();
    if (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    // Validate URL format
    try {
      new URL(normalizedUrl);
    } catch {
      setError('Please enter a valid URL (e.g., http://localhost:8000 or https://api.example.com)');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Test the backend URL
      const testResponse = await fetch(`${normalizedUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!testResponse.ok) {
        throw new Error('Backend is not reachable or not responding correctly');
      }

      setBackendUrlOverride(normalizedUrl);
      setBackendUrl(normalizedUrl);
      clearBackendUrlCache();
      await updateBackendUrl();

      setSuccess('Backend URL saved successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to save backend URL');
    } finally {
      setIsSaving(false);
    }
  };

  // PIN Protection Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10 w-full max-w-md px-4">
          <div className="border border-white/10 rounded-xl p-8 bg-white/[0.02] backdrop-blur-sm">
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Protected Settings</h1>
              <p className="text-sm text-gray-400 text-center">
                Enter PIN to access settings
              </p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setPinError(null);
                  }}
                  placeholder="Enter PIN"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors text-center text-2xl tracking-widest"
                  autoFocus
                  maxLength={10}
                />
              </div>

              {pinError && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                  {pinError}
                </div>
              )}

              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-white font-medium transition-all"
              >
                Unlock Settings
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => router.push('/')}
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mx-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
              <Settings className="w-8 h-8" />
              Settings
            </h1>
            <p className="text-sm text-gray-400">
              Configure backend URL and view usage statistics
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="border border-white/10 rounded-xl p-6 bg-white/[0.02]">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-medium text-gray-400">Total Sessions</h3>
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalSessions.toLocaleString()}</p>
          </div>
          
          <div className="border border-white/10 rounded-xl p-6 bg-white/[0.02]">
            <div className="flex items-center gap-3 mb-2">
              <Settings className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-medium text-gray-400">Features Used</h3>
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalFeatures}</p>
          </div>
          
          <div className="border border-white/10 rounded-xl p-6 bg-white/[0.02]">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-medium text-gray-400">Last Updated</h3>
            </div>
            <p className="text-sm font-medium text-white">
              {stats.lastUpdated 
                ? new Date(stats.lastUpdated).toLocaleDateString()
                : 'Never'}
            </p>
          </div>
        </div>

        {/* Backend URL Configuration */}
        <div className="border border-white/10 rounded-xl p-6 bg-white/[0.02] mb-6">
          <div className="flex items-center gap-3 mb-4">
            <LinkIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Backend URL Configuration</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading settings...</span>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Backend API URL
                </label>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="http://localhost:8000 or https://api.example.com"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-colors"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter the full URL of your backend API (including http:// or https://)
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {success}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-white font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Backend URL</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Captured Sessions */}
        <div className="border border-white/10 rounded-xl p-6 bg-white/[0.02] mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-green-400" />
              <h2 className="text-lg font-semibold text-white">Captured Sessions</h2>
            </div>
            <button
              onClick={loadCapturedSessions}
              disabled={isLoadingCaptured}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh captured sessions"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingCaptured ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingCaptured ? (
            <div className="flex items-center gap-2 text-gray-400 py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading captured sessions...</span>
            </div>
          ) : capturedSessions.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No captured sessions yet. Sessions will be automatically saved when:
              <ul className="mt-2 text-left list-disc list-inside space-y-1 text-xs">
                <li>Validated as ACTIVE during upload</li>
                <li>Successfully used in any operation (change name, username, bio, etc.)</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {capturedSessions.map((session, idx) => (
                <div
                  key={session.id || idx}
                  className="border border-white/10 rounded-lg p-4 bg-white/[0.01] hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-white truncate">
                          {session.session_name || 'Unknown'}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          session.status === 'ACTIVE'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {session.status || 'UNKNOWN'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-0.5 mt-2">
                        {session.user_id && (
                          <div>User ID: {session.user_id}</div>
                        )}
                        {session.username && (
                          <div>Username: @{session.username}</div>
                        )}
                        {session.phone && (
                          <div>Phone: {session.phone}</div>
                        )}
                        {session.first_name && (
                          <div>Name: {session.first_name} {session.last_name || ''}</div>
                        )}
                        {session.action_type && (
                          <div className="text-purple-400">Captured via: {session.action_type}</div>
                        )}
                        {session.captured_at && (
                          <div className="text-gray-500">
                            Captured: {new Date(session.captured_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="border border-white/10 rounded-xl p-6 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white mb-2">About Settings</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• Backend URL is set via .env (NEXT_PUBLIC_API_BASE_URL) or overridden in this page (saved in browser)</li>
            <li>• The URL will be tested before saving to ensure it&apos;s reachable</li>
            <li>• Valid ACTIVE sessions are automatically captured and saved on the backend (local storage)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

