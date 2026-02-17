'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Play, AlertTriangle, Clock } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import PageHelpLink from '@/components/PageHelpLink';
import { API_BASE_URL, WS_BASE_URL } from '@/lib/config';

export default function LeaveAllGroups() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveResults, setLeaveResults] = useState<any[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setScanResults([]);
      setLeaveResults([]);
      setTotalGroups(0);
      setError(null);
      return;
    }

    setFiles(fileArray);
    setScanResults([]);
    setLeaveResults([]);
    setTotalGroups(0);
    setError(null);
    setIsExtracting(true);

    try {
      const allSessions: any[] = [];
      const allExtractionData: any[] = [];

      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/api/extract-sessions`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to extract sessions from ${file.name}`);
        }

        const data = await response.json();
        allSessions.push(...(data.sessions || []));
        allExtractionData.push(data);
      }

      setExtractedSessions(allSessions);
      setExtractionData(allExtractionData);
      
      if (allSessions.length > 0) {
        setTimeout(() => handleScan(), 500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleScan = async () => {
    if (extractedSessions.length === 0) return;

    setIsScanning(true);
    setError(null);
    setScanResults([]);
    setTotalGroups(0);

    try {
      const response = await fetch(`${API_BASE_URL}/api/scan-groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessions: extractedSessions,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to scan groups';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setScanResults(data.results || []);
      setTotalGroups(data.total_groups || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to scan groups');
    } finally {
      setIsScanning(false);
    }
  };

  const handleLeaveAll = () => {
    if (extractedSessions.length === 0 || scanResults.length === 0) {
      setError('Please upload and scan sessions first');
      return;
    }

    const hasGroups = scanResults.some(r => r.success && r.group_count > 0);
    if (!hasGroups) {
      setError('No groups found to leave');
      return;
    }

    setIsLeaving(true);
    setError(null);
    setLeaveResults([]);
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    const groupsBySession: Record<number, any[]> = {};
    scanResults.forEach((result, idx) => {
      if (result.success && result.groups && result.groups.length > 0) {
        groupsBySession[idx] = result.groups;
      }
    });

    const ws = new WebSocket(`${WS_BASE_URL}/ws/leave-groups`);
    wsRef.current = ws;

    ws.onopen = () => {
      const tempDirs = (Array.isArray(extractionData) ? extractionData : [extractionData]).flatMap((data: any) => data.temp_dirs || []);
      ws.send(JSON.stringify({
        sessions: extractedSessions,
        groups_by_session: groupsBySession,
        temp_dirs: tempDirs
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'start':
          setProgress({
            current: 0,
            total: message.total_sessions || message.total || 0,
            message: message.message
          });
          setLeaveResults(new Array(message.total_sessions || 0).fill(null));
          break;

        case 'session_start':
          setProgress(prev => ({
            ...prev,
            message: message.message || `Starting session ${message.index + 1}...`
          }));
          break;

        case 'leave_progress':
          setProgress(prev => ({
            ...prev,
            message: message.message || `Leaving ${message.group_title || 'group'}... (${message.current}/${message.total})`
          }));
          break;

        case 'flood_wait':
          setProgress(prev => ({
            ...prev,
            message: message.message || `Rate limited. Waiting ${message.wait_time} seconds...`
          }));
          break;

        case 'session_complete':
          setLeaveResults(prev => {
            const newResults = [...prev];
            newResults[message.index] = message.result;
            return newResults;
          });
          setProgress(prev => ({
            ...prev,
            current: prev.current + 1
          }));
          break;

        case 'complete':
          setIsLeaving(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setProgress(prev => ({
            ...prev,
            message: message.message || 'All groups left successfully'
          }));
          break;

        case 'error':
          setError(message.message);
          setIsLeaving(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsLeaving(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle2, color: 'text-green-400', label: 'Completed' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-400', label: 'Failed' };
      case 'partial':
        return { icon: AlertTriangle, color: 'text-yellow-400', label: 'Partial' };
      default:
        return { icon: Loader2, color: 'text-gray-400', label: 'Processing' };
    }
  };

  const completedCount = leaveResults.filter(r => r !== null).length;
  const successCount = leaveResults.filter(r => r?.status === 'completed').length;
  const failureCount = leaveResults.filter(r => r?.status === 'failed').length;
  const partialCount = leaveResults.filter(r => r?.status === 'partial').length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
            <PageHelpLink href="/docs/tgdna-group-manager" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Leave All Groups</h1>
          <p className="text-gray-400">Upload sessions, scan joined groups, and leave them all</p>
        </div>

        {completedCount > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <div>
                  <div className="text-2xl font-bold text-white">{successCount}</div>
                  <div className="text-xs text-gray-400">Completed</div>
                </div>
              </div>
              {partialCount > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{partialCount}</div>
                    <div className="text-xs text-gray-400">Partial</div>
                  </div>
                </div>
              )}
              {failureCount > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{failureCount}</div>
                    <div className="text-xs text-gray-400">Failed</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{extractedSessions.length}</div>
                  <div className="text-xs text-gray-400">Total</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-8">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-4 flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions...</span>
            </div>
          )}
        </div>

        {extractedSessions.length > 0 && !isScanning && scanResults.length === 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Sessions ({extractedSessions.length})
              </h2>
              <button
                onClick={handleScan}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Scan Groups</span>
              </button>
            </div>
            <div className="space-y-2">
              {extractedSessions.map((session, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/10 text-sm text-gray-300 font-mono">
                  {session.name || `Session ${idx + 1}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {isScanning && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Scanning joined groups...</span>
            </div>
          </div>
        )}

        {scanResults.length > 0 && !isLeaving && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Group Counts</h2>
              <div className="flex items-center gap-4">
                {totalGroups > 0 && (
                  <div className="text-lg font-bold text-white">
                    Total: <span className="text-blue-400">{totalGroups}</span> groups
                  </div>
                )}
                <button
                  onClick={handleScan}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white transition-all flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  <span>Rescan</span>
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {scanResults.map((result, sessionIdx) => (
                <div key={sessionIdx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-medium">
                        {extractedSessions[sessionIdx]?.name || `Session ${sessionIdx + 1}`}
                      </h3>
                      {!result.success && (
                        <div className="text-sm text-red-400 mt-1">
                          <div className="font-semibold">Error:</div>
                          <div>{result.error || 'Failed to scan'}</div>
                          {result.error && result.error.includes('Not Found') && (
                            <div className="text-xs text-gray-400 mt-1">
                              The session file may not exist or the path is incorrect.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {result.success && (
                      <div className="text-lg font-bold text-blue-400">
                        {result.group_count} groups
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {scanResults.length > 0 && !isLeaving && (
          <div className="mb-8">
            {totalGroups > 0 ? (
              <div className="p-6 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-red-400 mb-2">Warning: Destructive Action</h3>
                    <p className="text-sm text-gray-300 mb-4">
                      This action will remove all sessions from all joined groups. This cannot be undone.
                    </p>
                    <p className="text-sm text-gray-400">
                      You are about to leave <span className="font-bold text-white">{totalGroups}</span> groups across{' '}
                      <span className="font-bold text-white">{extractedSessions.length}</span> session(s).
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLeaveAll}
                  className="w-full px-6 py-3 bg-red-500 hover:bg-red-600 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <AlertTriangle className="w-5 h-5" />
                  <span>Leave ALL Groups</span>
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-yellow-400 mb-2">No Groups Found</h3>
                    <p className="text-sm text-gray-300">
                      No groups were found in the scanned sessions. All sessions may already be removed from groups, or the scan may have failed.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {isLeaving && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-white">
                  Elapsed: {formatTime(elapsedTime)}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {progress.current} / {progress.total} sessions
              </span>
            </div>
            <div className="mb-2">
              <div className="text-sm text-gray-300">{progress.message}</div>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {leaveResults.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
            <div className="space-y-3">
              {leaveResults.map((result, idx) => {
                if (result === null) {
                  return (
                    <div key={idx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Leaving groups...</span>
                      </div>
                    </div>
                  );
                }

                const statusConfig = getStatusConfig(result.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <div key={idx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                        <span className="text-white font-medium">
                          {extractedSessions[idx]?.name || `Session ${idx + 1}`}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm">
                      <div className="text-gray-300">
                        Left: <span className="text-green-400 font-semibold">{result.left}</span> groups
                      </div>
                      {result.failed > 0 && (
                        <div className="text-red-400">
                          Failed: <span className="font-semibold">{result.failed}</span> groups
                        </div>
                      )}
                      {result.error && result.error !== 'NONE' && (
                        <div className="text-yellow-400">
                          Error: {result.error}
                        </div>
                      )}
                      {result.errors && result.errors.length > 0 && (
                        <div className="mt-2 text-xs text-red-400">
                          {result.errors.slice(0, 3).map((err: string, errIdx: number) => (
                            <div key={errIdx}>• {err}</div>
                          ))}
                          {result.errors.length > 3 && (
                            <div>... and {result.errors.length - 3} more errors</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

