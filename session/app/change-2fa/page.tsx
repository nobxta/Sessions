'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, ShieldCheck, CheckCircle2, XCircle,
  AlertTriangle, KeyRound, Eye, EyeOff, RefreshCw,
  Lock, Unlock, Zap, ShieldOff, ChevronDown, ChevronUp, FileText
} from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { API_BASE_URL } from '@/lib/config';
import { useSessionCleanup } from '@/hooks/useSessionCleanup';

interface Session { name: string; path: string; }
interface SessionResult {
  session_path: string;
  success: boolean;
  action?: string;
  error?: string;
  wrong_password?: boolean;
}

function PasswordInput({ value, onChange, placeholder, show, onToggle, label, hint }: {
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
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600">
          <Lock className="w-3.5 h-3.5" />
        </div>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-10 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:border-white/15 focus:border-blue-500/40 rounded-lg text-white placeholder-gray-600 focus:outline-none transition-all text-sm"
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function Change2FA() {
  const router = useRouter();
  const { newRequest, cancelToken, clearToken } = useSessionCleanup();
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

  // Collapse states
  const [showSessionList, setShowSessionList] = useState(false);
  const [showSuccessList, setShowSuccessList] = useState(false);
  const [showFailedList, setShowFailedList] = useState(true);

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
        if (!res.ok) throw new Error(`Failed to extract from ${file.name}`);
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
      const signal = newRequest();
      const res = await fetch(`${API_BASE_URL}/api/change-2fa`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: targetSessions,
          default_current_password: defaultCurrentPass || null,
          new_password: disableMode ? null : (newPass || null),
          cancel_token: cancelToken,
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
        setShowSuccessList(false);
        setShowFailedList(true);
      }
      clearToken();
    } catch (err: any) {
      if ((err as any)?.name !== 'AbortError') setError(err.message || 'Something went wrong');
    } finally {
      setIsProcessing(false);
    }
  };

  const successResults   = results.filter(r => r.success);
  const wrongPassResults = results.filter(r => r.wrong_password);
  const failedResults    = results.filter(r => !r.success && !r.wrong_password);
  const canRetry         = wrongPassResults.length > 0 && !isProcessing;
  const hasResults       = results.length > 0;
  const resultMap        = new Map(results.map(r => [r.session_path, r]));

  const sessionName = (path: string) => {
    const s = sessions.find(x => x.path === path);
    return s?.name || path.split('/').pop() || path;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-blue-600/4 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-72 h-72 bg-purple-600/4 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.012]" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <button onClick={() => router.push('/')}
          className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-300 transition-colors mb-7 group">
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-blue-500/15 blur-lg rounded-xl" />
            <div className="relative w-10 h-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 rounded-xl flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Change 2FA Password</h1>
            <p className="text-xs text-gray-500 mt-0.5">Bulk update or disable 2FA across all accounts</p>
          </div>
        </div>

        {/* Upload */}
        <div className="mb-5">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-2.5 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting sessions…
            </div>
          )}
        </div>

        {/* Uploaded sessions — collapsed pill */}
        {sessions.length > 0 && !isExtracting && (
          <button
            onClick={() => setShowSessionList(v => !v)}
            className="w-full mb-5 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:border-white/15 flex items-center gap-2.5 transition-colors group"
          >
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-sm text-gray-400 flex-1 text-left">
              <span className="text-white font-medium">{sessions.length}</span> sessions loaded
            </span>
            {showSessionList
              ? <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-600" />}
          </button>
        )}

        {/* Session list (collapsed by default) */}
        {showSessionList && sessions.length > 0 && (
          <div className="mb-5 rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
              {sessions.map((session, idx) => {
                const result = resultMap.get(session.path);
                const hasResult = result !== undefined;
                const isSuccess = result?.success === true;
                const isWrong = result?.wrong_password === true;
                const isFailed = hasResult && !isSuccess && !isWrong;
                return (
                  <div key={idx} className={`px-4 py-2.5 flex items-center gap-2.5 ${
                    isSuccess ? 'bg-green-500/[0.04]' : isWrong ? 'bg-yellow-500/[0.04]' : isFailed ? 'bg-red-500/[0.04]' : ''
                  }`}>
                    <div className="w-4 flex-shrink-0 flex justify-center">
                      {!hasResult && <div className="w-1.5 h-1.5 rounded-full bg-white/15" />}
                      {isSuccess  && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                      {isWrong    && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
                      {isFailed   && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <span className="text-xs font-mono text-gray-400 flex-1 truncate">{session.name}</span>
                    {hasResult && (
                      <span className={`text-[10px] font-medium flex-shrink-0 ${
                        isSuccess ? 'text-green-500' : isWrong ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {isSuccess ? (result.action === 'disabled' ? 'Disabled' : 'Changed') : isWrong ? 'Wrong pass' : 'Failed'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Password Settings */}
        {sessions.length > 0 && (
          <div className="mb-5 rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-white">Password Settings</span>
            </div>
            <div className="p-4 space-y-4">
              <PasswordInput
                label="Current 2FA Password"
                hint="— leave empty if no 2FA set"
                value={defaultCurrentPass}
                onChange={setDefaultCurrentPass}
                placeholder="Shared current password"
                show={showCurrentPass}
                onToggle={() => setShowCurrentPass(v => !v)}
              />

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { mode: false, icon: Lock, label: 'Change Password', sub: 'Set a new 2FA', color: 'blue' },
                  { mode: true,  icon: Unlock, label: 'Disable 2FA',   sub: 'Remove entirely', color: 'red' },
                ].map(({ mode, icon: Icon, label, sub, color }) => (
                  <button
                    key={String(mode)}
                    onClick={() => setDisableMode(mode)}
                    className={`relative p-3 rounded-lg border text-left transition-all ${
                      disableMode === mode
                        ? color === 'blue'
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/12'
                    }`}
                  >
                    {disableMode === mode && (
                      <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${color === 'blue' ? 'bg-blue-400' : 'bg-red-400'}`} />
                    )}
                    <Icon className={`w-3.5 h-3.5 mb-1.5 ${
                      disableMode === mode ? (color === 'blue' ? 'text-blue-400' : 'text-red-400') : 'text-gray-600'
                    }`} />
                    <div className={`text-xs font-semibold ${disableMode === mode ? 'text-white' : 'text-gray-500'}`}>{label}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>
                  </button>
                ))}
              </div>

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

              <button
                onClick={() => handleChange()}
                disabled={isProcessing || (!disableMode && !newPass.trim())}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed ${
                  disableMode
                    ? 'bg-red-500/70 hover:bg-red-500/90 border border-red-500/30 text-white'
                    : 'bg-blue-600/70 hover:bg-blue-600/90 border border-blue-500/30 text-white'
                }`}
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing {sessions.length} accounts…</>
                ) : disableMode ? (
                  <><ShieldOff className="w-4 h-4" /> Disable 2FA — {sessions.length} accounts</>
                ) : (
                  <><Zap className="w-4 h-4" /> Change 2FA — {sessions.length} accounts</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div className="space-y-3">

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { count: successResults.length,   label: 'Changed',        color: 'green',  icon: CheckCircle2 },
                { count: wrongPassResults.length, label: 'Wrong Password', color: 'yellow', icon: AlertTriangle },
                { count: failedResults.length,    label: 'Failed',         color: 'red',    icon: XCircle },
              ].map(({ count, label, color, icon: Icon }) => (
                <div key={label} className={`p-3 rounded-xl border text-center ${
                  color === 'green'  ? 'bg-green-500/8 border-green-500/20' :
                  color === 'yellow' ? 'bg-yellow-500/8 border-yellow-500/20' :
                                       'bg-red-500/8 border-red-500/20'
                }`}>
                  <div className={`text-xl font-bold text-white`}>{count}</div>
                  <div className={`text-[10px] mt-0.5 ${
                    color === 'green' ? 'text-green-500' : color === 'yellow' ? 'text-yellow-500' : 'text-red-500'
                  }`}>{label}</div>
                </div>
              ))}
            </div>

            {/* Success list */}
            {successResults.length > 0 && (
              <div className="rounded-xl border border-green-500/15 overflow-hidden">
                <button
                  onClick={() => setShowSuccessList(v => !v)}
                  className="w-full px-4 py-3 bg-green-500/[0.06] hover:bg-green-500/10 flex items-center gap-2.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-300 flex-1 text-left">
                    {successResults.length} account{successResults.length > 1 ? 's' : ''} {disableMode ? 'disabled' : 'changed'} successfully
                  </span>
                  {showSuccessList ? <ChevronUp className="w-3.5 h-3.5 text-green-600" /> : <ChevronDown className="w-3.5 h-3.5 text-green-600" />}
                </button>
                {showSuccessList && (
                  <div className="divide-y divide-green-500/10 max-h-48 overflow-y-auto">
                    {successResults.map(r => (
                      <div key={r.session_path} className="px-4 py-2.5 flex items-center gap-2.5 bg-green-500/[0.03]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <span className="text-xs font-mono text-gray-300 flex-1 truncate">{sessionName(r.session_path)}</span>
                        <span className="text-[10px] text-green-500">{r.action === 'disabled' ? 'Disabled' : 'Changed'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Wrong password / retry */}
            {wrongPassResults.length > 0 && (
              <div className="rounded-xl border border-yellow-500/20 overflow-hidden">
                <div className="px-4 py-3 bg-yellow-500/[0.07] flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-yellow-300">
                      {wrongPassResults.length} account{wrongPassResults.length > 1 ? 's have' : ' has'} a different password
                    </p>
                    <p className="text-[10px] text-yellow-600 mt-0.5">Enter each account's correct current password below</p>
                  </div>
                </div>
                <div className="p-4 space-y-3 bg-yellow-500/[0.03]">
                  {wrongPassResults.map(r => (
                    <div key={r.session_path} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-400 w-32 truncate flex-shrink-0">{sessionName(r.session_path)}</span>
                      <div className="relative flex-1">
                        <input
                          type={showOverride[r.session_path] ? 'text' : 'password'}
                          value={overrides[r.session_path] || ''}
                          onChange={e => setOverrides(prev => ({ ...prev, [r.session_path]: e.target.value }))}
                          placeholder="Correct current password"
                          className="w-full px-3 py-2 pr-8 bg-black/20 border border-yellow-500/20 hover:border-yellow-500/40 focus:border-yellow-400/50 rounded-lg text-white placeholder-gray-600 focus:outline-none transition-colors text-xs"
                        />
                        <button type="button"
                          onClick={() => setShowOverride(prev => ({ ...prev, [r.session_path]: !prev[r.session_path] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors">
                          {showOverride[r.session_path] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => handleChange(wrongPassResults.map(r => r.session_path))}
                    disabled={isProcessing}
                    className="w-full py-2 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/25 rounded-lg text-yellow-300 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Retry {wrongPassResults.length} account{wrongPassResults.length > 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            {/* Failed list */}
            {failedResults.length > 0 && (
              <div className="rounded-xl border border-red-500/15 overflow-hidden">
                <button
                  onClick={() => setShowFailedList(v => !v)}
                  className="w-full px-4 py-3 bg-red-500/[0.06] hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-red-300 flex-1 text-left">
                    {failedResults.length} account{failedResults.length > 1 ? 's' : ''} failed
                  </span>
                  {showFailedList ? <ChevronUp className="w-3.5 h-3.5 text-red-600" /> : <ChevronDown className="w-3.5 h-3.5 text-red-600" />}
                </button>
                {showFailedList && (
                  <div className="divide-y divide-red-500/10 max-h-48 overflow-y-auto">
                    {failedResults.map(r => (
                      <div key={r.session_path} className="px-4 py-2.5 bg-red-500/[0.03]">
                        <div className="flex items-center gap-2.5 mb-0.5">
                          <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                          <span className="text-xs font-mono text-gray-300 truncate">{sessionName(r.session_path)}</span>
                        </div>
                        {r.error && (
                          <p className="text-[10px] text-red-500/70 ml-6 truncate">{r.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
