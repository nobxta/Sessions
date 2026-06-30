'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, ShieldCheck, CheckCircle2, XCircle,
  AlertTriangle, KeyRound, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { API_BASE_URL } from '@/lib/config';

interface Session {
  name: string;
  path: string;
}

interface SessionResult {
  session_path: string;
  success: boolean;
  action?: string;
  error?: string;
  wrong_password?: boolean;
}

export default function Change2FA() {
  const router = useRouter();

  // Upload state
  const [isExtracting, setIsExtracting] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);

  // Password fields
  const [defaultCurrentPass, setDefaultCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [disableMode, setDisableMode] = useState(false);

  // Per-session override for wrong-password accounts
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showOverride, setShowOverride] = useState<Record<string, boolean>>({});

  // Results
  const [results, setResults] = useState<SessionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles
      ? Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]
      : [];

    if (fileArray.length === 0) {
      setSessions([]);
      setResults([]);
      setError(null);
      return;
    }

    setIsExtracting(true);
    setResults([]);
    setError(null);

    try {
      const allSessions: Session[] = [];
      let lastExtraction: any = null;

      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE_URL}/api/extract-sessions`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error(`Failed to extract sessions from ${file.name}`);
        const data = await res.json();
        allSessions.push(...(data.sessions || []));
        lastExtraction = data;
      }

      setSessions(allSessions);
      setExtractionData(lastExtraction);
    } catch (err: any) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Change 2FA ─────────────────────────────────────────────────────────────
  const handleChange = async (retrySessionPaths?: string[]) => {
    if (sessions.length === 0) return;

    setIsProcessing(true);
    setError(null);

    // If retrying, only send wrong-password sessions with their override passwords
    const targetSessions = retrySessionPaths
      ? sessions
          .filter(s => retrySessionPaths.includes(s.path))
          .map(s => ({
            path: s.path,
            name: s.name,
            current_password: overrides[s.path] || defaultCurrentPass || undefined,
          }))
      : sessions.map(s => ({ path: s.path, name: s.name }));

    try {
      const res = await fetch(`${API_BASE_URL}/api/change-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: targetSessions,
          default_current_password: defaultCurrentPass || null,
          new_password: disableMode ? null : (newPass || null),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Request failed');
      }

      const data = await res.json();
      const newResults: SessionResult[] = data.results || [];

      if (retrySessionPaths) {
        // Merge retry results into existing results
        setResults(prev => {
          const map = new Map(prev.map(r => [r.session_path, r]));
          newResults.forEach(r => map.set(r.session_path, r));
          return Array.from(map.values());
        });
      } else {
        setResults(newResults);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  const wrongPassResults = results.filter(r => r.wrong_password);
  const canRetry = wrongPassResults.length > 0 && !isProcessing;

  const resultMap = new Map(results.map(r => [r.session_path, r]));

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Grid bg */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <KeyRound className="w-7 h-7 text-blue-400" />
            Change 2FA Password
          </h1>
          <p className="text-sm text-gray-400">
            Upload sessions and change or disable Two-Factor Authentication for all accounts in bulk
          </p>
        </div>

        {/* Upload */}
        <div className="mb-8">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions…</span>
            </div>
          )}
        </div>

        {/* Password config */}
        {sessions.length > 0 && (
          <div className="mb-8 p-5 rounded-xl bg-white/[0.03] border border-white/10 space-y-5">
            <h2 className="text-base font-semibold text-white">Password Settings</h2>

            {/* Current password */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Current 2FA Password
                <span className="ml-1 text-gray-600">(leave empty if accounts have no 2FA)</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={defaultCurrentPass}
                  onChange={e => setDefaultCurrentPass(e.target.value)}
                  placeholder="Current password for most accounts"
                  className="w-full px-4 py-2.5 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Disable toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDisableMode(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${disableMode ? 'bg-red-500/70' : 'bg-white/10'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${disableMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-gray-300">
                {disableMode ? 'Disable 2FA (remove password)' : 'Change to new password'}
              </span>
            </div>

            {/* New password */}
            {!disableMode && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">New 2FA Password</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="New password for all accounts"
                    className="w-full px-4 py-2.5 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Action button */}
            <button
              onClick={() => handleChange()}
              disabled={isProcessing || (!disableMode && !newPass.trim())}
              className="w-full py-2.5 bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-500/30 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing {sessions.length} accounts…</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> {disableMode ? 'Disable 2FA' : 'Change 2FA'} for {sessions.length} accounts</>
              )}
            </button>
          </div>
        )}

        {/* Summary */}
        {results.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10 flex items-center gap-8">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <div className="text-2xl font-bold text-white">{successCount}</div>
                <div className="text-xs text-gray-400">Success</div>
              </div>
            </div>
            {failedCount > 0 && (
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <div>
                  <div className="text-2xl font-bold text-white">{failedCount}</div>
                  <div className="text-xs text-gray-400">Failed</div>
                </div>
              </div>
            )}
            {wrongPassResults.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <div>
                  <div className="text-2xl font-bold text-white">{wrongPassResults.length}</div>
                  <div className="text-xs text-gray-400">Wrong Password</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wrong-password retry banner */}
        {canRetry && (
          <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-300">
                  {wrongPassResults.length} account{wrongPassResults.length > 1 ? 's have' : ' has'} a different current password
                </p>
                <p className="text-xs text-yellow-400/70 mt-0.5">
                  Enter the correct current password for each account below and retry
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {wrongPassResults.map(r => {
                const session = sessions.find(s => s.path === r.session_path);
                return (
                  <div key={r.session_path} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-300 w-40 truncate flex-shrink-0">
                      {session?.name || r.session_path.split('/').pop()}
                    </span>
                    <div className="relative flex-1">
                      <input
                        type={showOverride[r.session_path] ? 'text' : 'password'}
                        value={overrides[r.session_path] || ''}
                        onChange={e => setOverrides(prev => ({ ...prev, [r.session_path]: e.target.value }))}
                        placeholder="Correct current password"
                        className="w-full px-3 py-1.5 pr-9 bg-black/30 border border-yellow-500/30 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400/60 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOverride(prev => ({ ...prev, [r.session_path]: !prev[r.session_path] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        {showOverride[r.session_path] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => handleChange(wrongPassResults.map(r => r.session_path))}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm font-medium transition-all disabled:opacity-40"
            >
              <RefreshCw className="w-4 h-4" />
              Retry {wrongPassResults.length} account{wrongPassResults.length > 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Session list */}
        {sessions.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-white mb-3">
              Sessions ({sessions.length})
            </h2>
            {sessions.map((session, idx) => {
              const result = resultMap.get(session.path);
              const hasResult = result !== undefined;
              const isSuccess = result?.success === true;
              const isWrong = result?.wrong_password === true;

              return (
                <div
                  key={idx}
                  className={`px-4 py-3 rounded-lg border flex items-center gap-3 transition-all ${
                    !hasResult
                      ? 'bg-white/[0.02] border-white/10'
                      : isSuccess
                      ? 'bg-green-500/10 border-green-500/30'
                      : isWrong
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {!hasResult && <div className="w-4 h-4 rounded-full border border-white/20" />}
                    {hasResult && isSuccess && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    {hasResult && isWrong && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                    {hasResult && !isSuccess && !isWrong && <XCircle className="w-4 h-4 text-red-400" />}
                  </div>
                  <span className="text-sm font-mono text-gray-300 flex-1 truncate">{session.name}</span>
                  {hasResult && (
                    <span className={`text-xs flex-shrink-0 ${
                      isSuccess ? 'text-green-400' : isWrong ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {isSuccess
                        ? result.action === 'disabled' ? 'Disabled' : 'Changed'
                        : isWrong
                        ? 'Wrong password'
                        : result?.error || 'Failed'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
