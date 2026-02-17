'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  ShieldAlert,
  Clock,
  Ban,
  MessageSquareWarning,
  ExternalLink,
  AlertCircle,
  Lock,
} from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import PageHelpLink from '@/components/PageHelpLink';
import { API_BASE_URL, WS_BASE_URL } from '@/lib/config';

type AppealUiStatus = 'idle' | 'processing' | 'verification' | 'submitting' | 'success' | 'failed';

function extractLinkFromText(text: string | undefined): string {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/https?:\/\/[^\s)\]]+/);
  return match ? match[0] : '';
}

type AppealResult = {
  session_name: string;
  path: string;
  phone: string;
  status: string;
  response: string;
  index?: number;
  verify_results?: { status: string; response: string }[];
};

export default function SpamBotAppeal() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [appealResults, setAppealResults] = useState<AppealResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appealUiStatus, setAppealUiStatus] = useState<AppealUiStatus>('idle');
  const [appealModal, setAppealModal] = useState<{
    open: boolean;
    sessionIndex: number;
    session: any;
    link?: string;
    message?: string;
  }>({ open: false, sessionIndex: -1, session: null });
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setAppealResults([]);
      setError(null);
      return;
    }
    setFiles(fileArray);
    setAppealResults([]);
    setError(null);
    setIsExtracting(true);
    try {
      const allSessions: any[] = [];
      const allExtractionData: any[] = [];
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_BASE_URL}/api/extract-sessions`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Failed to extract sessions from ${file.name}`);
        const data = await response.json();
        allSessions.push(...(data.sessions || []));
        allExtractionData.push(data);
      }
      setExtractedSessions(allSessions);
      setExtractionData(allExtractionData);
    } catch (err: any) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleStartAppealCheck = async () => {
    if (extractedSessions.length === 0) {
      setError('Please upload sessions first');
      return;
    }
    setIsChecking(true);
    setError(null);
    setAppealResults([]);
    setAppealUiStatus('idle');
    try {
      const response = await fetch(`${API_BASE_URL}/api/check-spambot-appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: extractedSessions }),
      });
      if (!response.ok) {
        const errText = await response.text();
        let msg = 'Failed to check SpamBot appeal status';
        try {
          const errData = JSON.parse(errText);
          msg = errData.detail || errData.message || msg;
        } catch {
          msg = errText || msg;
        }
        throw new Error(msg);
      }
      const data = await response.json();
      setAppealResults(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to check appeal status');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmitAppeal = (sessionIndex: number) => {
    const session = extractedSessions[sessionIndex];
    if (!session) return;
    setAppealSubmitting(true);
    setError(null);
    setAppealUiStatus('processing');
    const tempDirs = (Array.isArray(extractionData) ? extractionData : [extractionData]).flatMap(
      (d: any) => d.temp_dirs || []
    );
    const ws = new WebSocket(`${WS_BASE_URL}/ws/spambot-appeal`);
    wsRef.current = ws;

    ws.onopen = () => {
      const status = appealResults[sessionIndex]?.status || 'HARD_LIMITED';
      ws.send(JSON.stringify({ session, temp_dirs: tempDirs, status }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'start' || msg.type === 'progress') {
          setAppealUiStatus('processing');
        } else if (msg.type === 'verification_required') {
          setAppealUiStatus('verification');
          setAppealModal({
            open: true,
            sessionIndex,
            session,
            link: msg.link || extractLinkFromText(msg.message),
            message: msg.message,
          });
        } else if (msg.type === 'complete') {
          setAppealUiStatus('success');
          setAppealSubmitting(false);
          setAppealModal((m) => ({ ...m, open: false }));
          setAppealResults((prev) => {
            const next = [...prev];
            if (next[sessionIndex]) next[sessionIndex] = { ...next[sessionIndex], status: 'APPEAL_SENT' };
            return next;
          });
        } else if (msg.type === 'error') {
          setAppealUiStatus('failed');
          setError(msg.message);
          setAppealSubmitting(false);
          setAppealModal((m) => ({ ...m, open: false }));
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      setAppealUiStatus('failed');
      setError('Connection error');
      setAppealSubmitting(false);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  };

  const handleConfirmVerification = () => {
    setAppealUiStatus('submitting');
    setAppealModal((m) => ({ ...m, open: false }));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'confirm_verification' }));
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'FREE':
        return { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', label: 'Free' };
      case 'TEMP_LIMITED':
        return { icon: Clock, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30', label: 'Temp Limited' };
      case 'HARD_LIMITED':
        return { icon: Ban, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30', label: 'Hard Limited' };
      case 'FROZEN':
        return { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', label: 'Frozen' };
      case 'APPEAL_SENT':
        return { icon: MessageSquareWarning, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30', label: 'Appeal Sent' };
      default:
        return { icon: AlertCircle, color: 'text-gray-400', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-500/30', label: status || 'Unknown' };
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <button onClick={() => router.push('/')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
            <PageHelpLink href="/docs/spambot-checker" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">SpamBot Appeal</h1>
          <p className="text-gray-400">Check status with @SpamBot and submit appeals for hard-limited or frozen accounts.</p>
        </div>

        <div className="mb-8">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-4 flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions...</span>
            </div>
          )}
        </div>

        {extractedSessions.length > 0 && appealResults.length === 0 && !isChecking && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Sessions ({extractedSessions.length})</h2>
              <button
                onClick={handleStartAppealCheck}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Start Appeal Check</span>
              </button>
            </div>
            <div className="space-y-2">
              {extractedSessions.map((s, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/10 text-sm text-gray-300 font-mono">
                  {s.name || `Session ${idx + 1}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {isChecking && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Checking status and verifying temp-limited accounts...</span>
            </div>
          </div>
        )}

        {error && appealUiStatus !== 'failed' && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {appealResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {appealResults.map((result, idx) => {
                const statusConfig = getStatusConfig(result.status);
                const StatusIcon = statusConfig.icon;
                const canSubmitAppeal = (result.status === 'HARD_LIMITED' || result.status === 'FROZEN') && !appealSubmitting;
                return (
                  <div key={idx} className={`p-5 rounded-lg border ${statusConfig.bgColor} ${statusConfig.borderColor}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                        <span className="text-white font-medium">{result.session_name}</span>
                      </div>
                      <span className={`text-xs font-semibold ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                    {result.phone && (
                      <div className="text-sm text-gray-400 mb-2">+{result.phone}</div>
                    )}
                    {canSubmitAppeal && (
                      <button
                        onClick={() => handleSubmitAppeal(idx)}
                        className={`mt-2 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                          result.status === 'FROZEN'
                            ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300'
                            : 'bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300'
                        }`}
                      >
                        <MessageSquareWarning className="w-4 h-4" />
                        Submit Appeal
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {appealSubmitting && appealUiStatus === 'processing' && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400 flex-shrink-0" />
            <span className="text-white">Processing appeal...</span>
          </div>
        )}

        {appealSubmitting && appealUiStatus === 'submitting' && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400 flex-shrink-0" />
            <span className="text-white">Submitting appeal...</span>
          </div>
        )}

        {appealUiStatus === 'success' && !appealSubmitting && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <span className="text-white">Appealed successfully!</span>
          </div>
        )}

        {appealUiStatus === 'failed' && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-white font-medium">Appeal failed</span>
              {error && <p className="text-red-300/90 text-sm mt-1">{error}</p>}
            </div>
          </div>
        )}

        {appealModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
            <div className="bg-[#1a1a22] border border-white/20 rounded-xl p-6 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-400" />
                Verification required
              </h3>
              <p className="text-gray-400 text-sm mb-4">Please verify you are a human. Open the link below, complete the step, then click Done.</p>
              {appealModal.link ? (
                <a
                  href={appealModal.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/25 hover:bg-blue-500/35 border border-blue-500/50 rounded-lg text-white font-medium"
                >
                  <ExternalLink className="w-5 h-5 flex-shrink-0" />
                  Open verification link
                </a>
              ) : (
                <p className="text-amber-400/90 text-sm mb-4">No link received. Check Telegram for the verification message from SpamBot and complete it there, then click Done.</p>
              )}
              <button
                onClick={handleConfirmVerification}
                className="w-full px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {extractedSessions.length > 0 && !isChecking && appealResults.length === 0 && (
          <div className="mb-8 p-8 rounded-lg bg-white/[0.02] border border-white/10 text-center text-gray-400">
            Upload sessions and click &quot;Start Appeal Check&quot; to see status. For hard-limited or frozen accounts you can submit an appeal; verification link is shown when required.
          </div>
        )}
      </div>
    </div>
  );
}
