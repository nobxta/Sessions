'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, ShieldCheck, CheckCircle2, XCircle,
  AlertTriangle, KeyRound, Eye, EyeOff, RefreshCw, Shield,
  ShieldOff, Lock, Unlock, Zap
} from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { API_BASE_URL } from '@/lib/config';

interface Session { name: string; path: string; }
interface SessionResult {
  session_path: string;
  success: boolean;
  action?: string;
  error?: string;
  wrong_password?: boolean;
}

function PasswordInput({
  value, onChange, placeholder, show, onToggle, label, hint
}: {
  value: string; onChange: (v: string) => void; placeholder: string;
  show: boolean; onToggle: () => void; label: string; hint?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
        {label}
        {hint && <span className="text-gray-600 font-normal">{hint}</span>}
      </label>
      <div className="relative group">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-purple-500/0 group-focus-within:from-blue-500/10 group-focus-within:via-blue-500/5 group-focus-within:to-purple-500/10 transition-all duration-300 rounded-xl pointer-events-none" />
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
          <Lock className="w-4 h-4" />
        </div>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-11 py-3 bg-white/[0.04] border border-white/[0.08] hover:border-white/15 focus:border-blue-500/40 rounded-xl text-white placeholder-gray-600 focus:outline-none transition-all duration-200 text-sm"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-0.5"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, color }: {
  icon: React.ReactNode; value: number; label: string;
  color: 'green' | 'red' | 'yellow' | 'blue';
}) {
  const colors = {
    green: 'from-green-500/10 to-green-500/5 border-green-500/20 text-green-400',
    red:   'from-red-500/10 to-red-500/5 border-red-500/20 text-red-400',
    yellow:'from-yellow-500/10 to-yellow-500/5 border-yellow-500/20 text-yellow-400',
    blue:  'from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400',
  };
  return (
    <div className={`flex-1 p-4 rounded-xl bg-gradient-to-br ${colors[color]} border flex items-center gap-3`}>
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function Change2FA() {
  const router = useRouter();
  const [isExtracting, setIsExtracting] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [defaultCurrentPass, setDefaultCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showOverride, setShowOverride] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<SessionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    if (fileArray.length === 0) { setSessions([]); setResults([]); setError(null); return; }
    setIsExtracting(true); setResults([]); setError(null);
    try {
      const allSessions: Session[] = [];
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_BASE_URL}/api/extract-sessions`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Failed to extract sessions from ${file.name}`);
        const data = await res.json();
        allSessions.push(...(data.sessions || []));
      }
      setSessions(allSessions);
    } catch (err: any) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleChange = async (retrySessionPaths?: string[]) => {
    if (sessions.length === 0) return;
    setIsProcessing(true); setError(null);
    const targetSessions = retrySessionPaths
      ? sessions.filter(s => retrySessionPaths.includes(s.path)).map(s => ({
          path: s.path, name: s.name,
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
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Request failed'); }
      const data = await res.json();
      const newResults: SessionResult[] = data.results || [];
      if (retrySessionPaths) {
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

  const successCount    = results.filter(r => r.success).length;
  const failedCount     = results.filter(r => !r.success && !r.wrong_password).length;
  const wrongPassResults = results.filter(r => r.wrong_password);
  const canRetry        = wrongPassResults.length > 0 && !isProcessing;
  const resultMap       = new Map(results.map(r => [r.session_path, r]));
  const hasResults      = results.length > 0;
  const allDone         = hasResults && successCount === sessions.length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Header ── */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-7 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </button>

          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-2xl" />
              <div className="relative w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/25 rounded-2xl flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Change 2FA Password</h1>
              <p className="text-sm text-gray-500 mt-1">
                Bulk update or disable Two-Factor Authentication across all accounts
              </p>
            </div>
          </div>
        </div>

        {/* ── Upload ── */}
        <div className="mb-6">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Extracting sessions…
            </div>
          )}
        </div>

        {/* ── Password Settings Card ── */}
        {sessions.length > 0 && (
          <div className="mb-6 rounded-2xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">Password Settings</span>
              <span className="ml-auto text-xs text-gray-600 font-mono">{sessions.length} accounts</span>
            </div>

            <div className="p-5 space-y-5">
              <PasswordInput
                label="Current 2FA Password"
                hint="— leave empty if accounts have no 2FA"
                value={defaultCurrentPass}
                onChange={setDefaultCurrentPass}
                placeholder="Shared current password"
                show={showCurrentPass}
                onToggle={() => setShowCurrentPass(v => !v)}
              />

              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDisableMode(false)}
                  className={`relative p-3.5 rounded-xl border transition-all duration-200 text-left ${
                    !disableMode
                      ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/5'
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/15'
                  }`}
                >
                  {!disableMode && (
                    <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-blue-400" />
                  )}
                  <Lock className={`w-4 h-4 mb-2 ${!disableMode ? 'text-blue-400' : 'text-gray-500'}`} />
                  <div className={`text-xs font-semibold ${!disableMode ? 'text-white' : 'text-gray-400'}`}>Change Password</div>
                  <div className="text-[11px] text-gray-600 mt-0.5">Set a new 2FA password</div>
                </button>
                <button
                  onClick={() => setDisableMode(true)}
                  className={`relative p-3.5 rounded-xl border transition-all duration-200 text-left ${
                    disableMode
                      ? 'bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/5'
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/15'
                  }`}
                >
                  {disableMode && (
                    <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                  <Unlock className={`w-4 h-4 mb-2 ${disableMode ? 'text-red-400' : 'text-gray-500'}`} />
                  <div className={`text-xs font-semibold ${disableMode ? 'text-white' : 'text-gray-400'}`}>Disable 2FA</div>
                  <div className="text-[11px] text-gray-600 mt-0.5">Remove password entirely</div>
                </button>
              </div>

              {/* New password */}
              {!disableMode && (
                <PasswordInput
                  label="New 2FA Password"
                  value={newPass}
                  onChange={setNewPass}
                  placeholder="New password for all accounts"
                  show={showNewPass}
                  onToggle={() => setShowNewPass(v => !v)}
                />
              )}

              {/* CTA */}
              <button
                onClick={() => handleChange()}
                disabled={isProcessing || (!disableMode && !newPass.trim())}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  disableMode
                    ? 'bg-red-500/80 hover:bg-red-500 border border-red-400/30 text-white shadow-lg shadow-red-500/10'
                    : 'bg-blue-600/80 hover:bg-blue-600 border border-blue-500/30 text-white shadow-lg shadow-blue-500/10'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing {sessions.length} accounts…
                  </>
                ) : disableMode ? (
                  <>
                    <ShieldOff className="w-4 h-4" />
                    Disable 2FA for {sessions.length} accounts
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Change 2FA for {sessions.length} accounts
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Results Summary ── */}
        {hasResults && (
          <div className="mb-6 grid grid-cols-3 gap-3">
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
              value={successCount} label="Success" color="green"
            />
            <StatCard
              icon={<XCircle className="w-5 h-5 text-red-400" />}
              value={failedCount} label="Failed" color="red"
            />
            <StatCard
              icon={<AlertTriangle className="w-5 h-5 text-yellow-400" />}
              value={wrongPassResults.length} label="Wrong Password" color="yellow"
            />
          </div>
        )}

        {/* ── All success banner ── */}
        {allDone && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-300">All accounts updated successfully</p>
              <p className="text-xs text-green-500/70 mt-0.5">2FA has been {disableMode ? 'disabled' : 'changed'} for all {sessions.length} accounts</p>
            </div>
          </div>
        )}

        {/* ── Wrong-password retry ── */}
        {canRetry && (
          <div className="mb-6 rounded-2xl bg-yellow-500/[0.06] border border-yellow-500/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-yellow-500/15 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <div>
                <p className="text-sm font-semibold text-yellow-300">
                  {wrongPassResults.length} account{wrongPassResults.length > 1 ? 's have' : ' has'} a different password
                </p>
                <p className="text-xs text-yellow-600 mt-0.5">Enter each account's correct current password below</p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              {wrongPassResults.map(r => {
                const session = sessions.find(s => s.path === r.session_path);
                const name = session?.name || r.session_path.split('/').pop() || '';
                return (
                  <div key={r.session_path} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-gray-300 truncate mb-1.5">{name}</div>
                      <div className="relative">
                        <input
                          type={showOverride[r.session_path] ? 'text' : 'password'}
                          value={overrides[r.session_path] || ''}
                          onChange={e => setOverrides(prev => ({ ...prev, [r.session_path]: e.target.value }))}
                          placeholder="Correct current password"
                          className="w-full px-3 py-2 pr-9 bg-black/20 border border-yellow-500/20 hover:border-yellow-500/35 focus:border-yellow-400/50 rounded-lg text-white placeholder-gray-600 focus:outline-none transition-colors text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOverride(prev => ({ ...prev, [r.session_path]: !prev[r.session_path] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
                        >
                          {showOverride[r.session_path] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => handleChange(wrongPassResults.map(r => r.session_path))}
                disabled={isProcessing}
                className="w-full mt-1 py-2.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/25 rounded-xl text-yellow-300 text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Retry {wrongPassResults.length} account{wrongPassResults.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── Session list ── */}
        {sessions.length > 0 && (
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Sessions</span>
              <span className="text-xs text-gray-600 font-mono">{sessions.length} total</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {sessions.map((session, idx) => {
                const result = resultMap.get(session.path);
                const hasResult = result !== undefined;
                const isSuccess = result?.success === true;
                const isWrong = result?.wrong_password === true;
                const isFailed = hasResult && !isSuccess && !isWrong;

                return (
                  <div
                    key={idx}
                    className={`px-5 py-3 flex items-center gap-3 transition-colors ${
                      isSuccess ? 'bg-green-500/[0.04]' :
                      isWrong  ? 'bg-yellow-500/[0.04]' :
                      isFailed ? 'bg-red-500/[0.04]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0 w-5 flex items-center justify-center">
                      {!hasResult && (
                        <div className="w-2 h-2 rounded-full bg-white/15" />
                      )}
                      {isSuccess  && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                      {isWrong    && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                      {isFailed   && <XCircle className="w-4 h-4 text-red-400" />}
                    </div>

                    {/* Name */}
                    <span className="text-sm font-mono text-gray-300 flex-1 truncate">{session.name}</span>

                    {/* Status badge */}
                    {hasResult && (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                        isSuccess
                          ? 'bg-green-500/15 text-green-400'
                          : isWrong
                          ? 'bg-yellow-500/15 text-yellow-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {isSuccess
                          ? result.action === 'disabled' ? '✓ Disabled' : '✓ Changed'
                          : isWrong
                          ? 'Wrong password'
                          : result?.error?.slice(0, 28) || 'Failed'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="mt-5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
