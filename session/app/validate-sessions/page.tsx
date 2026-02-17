'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Play, Download } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import PageHelpLink from '@/components/PageHelpLink';
import SessionResult from '@/components/SessionResult';
import { API_BASE_URL, WS_BASE_URL, trackUsage, getBackendUrl } from '@/lib/config';

export default function ValidateSessions() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [error, setError] = useState<string | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<number>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setResults([]);
      setError(null);
      return;
    }

    setFiles(fileArray);
    setResults([]);
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
    } catch (err: any) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleValidate = () => {
    if (extractedSessions.length === 0) return;

    setIsValidating(true);
    setError(null);
    setResults(new Array(extractedSessions.length).fill(null));
    setProgress({ current: 0, total: extractedSessions.length, message: 'Starting validation...' });

    const ws = new WebSocket(`${WS_BASE_URL}/ws/validate`);
    wsRef.current = ws;

    ws.onopen = () => {
      const tempDirs = extractionData
        ?.map((d: any) => d.temp_dir)
        .filter(Boolean)
        .filter((v: any, i: number, a: any[]) => a.indexOf(v) === i);
      
      ws.send(JSON.stringify({
        session_paths: extractedSessions,
        temp_dirs: tempDirs
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'start':
          setProgress({
            current: 0,
            total: data.total,
            message: data.message
          });
          break;

        case 'progress':
          setProgress(prev => ({
            ...prev,
            current: data.index,
            message: data.message || `Validating ${data.session_name}...`
          }));
          break;

        case 'result':
          setResults(prev => {
            const newResults = [...prev];
            newResults[data.index] = data.result;
            return newResults;
          });
          setRecentlyCompleted(prev => new Set([...prev, data.index]));
          setTimeout(() => {
            setRecentlyCompleted(prev => {
              const newSet = new Set(prev);
              newSet.delete(data.index);
              return newSet;
            });
          }, 2000);
          
          setProgress(prev => {
            const completed = prev.current + 1;
            return {
              ...prev,
              current: completed,
              message: data.message || `${data.session_name} completed - ${data.result?.status || 'DONE'} (${completed}/${prev.total})`
            };
          });
          break;

        case 'complete':
          setProgress(prev => ({
            ...prev,
            message: data.message || 'All sessions validated'
          }));
          setIsValidating(false);
          ws.close();
          break;

        case 'error':
          setError(data.message);
          setIsValidating(false);
          ws.close();
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsValidating(false);
    };

    ws.onclose = () => {
      setIsValidating(false);
    };
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleDownload = async (status: string) => {
    const filteredResults = results
      .map((result, index) => ({ result, index, sessionInfo: extractedSessions[index] }))
      .filter(({ result }) => result && result.status === status);

    if (filteredResults.length === 0) {
      setError(`No ${status} sessions to download`);
      return;
    }

    try {
      const downloadData = {
        sessions: filteredResults.map(({ result, sessionInfo }) => ({
          name: result.session_name || sessionInfo?.name,
          path: sessionInfo?.path,
          status: result.status
        })),
        status: status,
        extraction_data: extractionData
      };

      const response = await fetch(`${API_BASE_URL}/api/download-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(downloadData),
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${status.toLowerCase()}_sessions_${new Date().getTime()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to download sessions');
    }
  };

  const completedCount = results.filter(r => r !== null).length;

  // Track usage when validation completes
  useEffect(() => {
    if (completedCount > 0 && completedCount === extractedSessions.length && !isValidating) {
      trackUsage('validate_sessions', extractedSessions.length);
    }
  }, [completedCount, extractedSessions.length, isValidating]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Dashboard</span>
            </button>
            <PageHelpLink href="/docs/session-validator" />
          </div>
          
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Validate Sessions
            </h1>
            <p className="text-sm text-gray-400">
              Upload multiple session files or ZIP archives to validate their status
            </p>
          </div>
        </div>

        <div className="mb-8">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          
          {isExtracting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions from {files.length} file{files.length !== 1 ? 's' : ''}...</span>
            </div>
          )}
        </div>

        {extractedSessions.length > 0 && !isValidating && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Found {extractedSessions.length} Session{extractedSessions.length !== 1 ? 's' : ''}
              </h2>
              <button
                onClick={handleValidate}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Validate All</span>
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {extractedSessions.map((session, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-white/[0.02] border border-white/10 flex items-center gap-3"
                >
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                  <span className="text-sm text-gray-300 font-mono">{session.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isValidating && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">
                {progress.message}
              </span>
              <span className="text-xs text-gray-400">
                {progress.current} / {progress.total} completed
              </span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Validating in real-time...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {(isValidating || completedCount > 0) && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">
                Results ({completedCount} / {extractedSessions.length})
              </h2>
              
              {completedCount === extractedSessions.length && !isValidating && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const unauthorizedCount = results.filter(r => r?.status === 'UNAUTHORIZED').length;
                    const frozenCount = results.filter(r => r?.status === 'FROZEN').length;
                    const activeCount = results.filter(r => r?.status === 'ACTIVE').length;
                    
                    return (
                      <>
                        {unauthorizedCount > 0 && (
                          <button
                            onClick={() => handleDownload('UNAUTHORIZED')}
                            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium transition-all flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            <span>Unauthorized ({unauthorizedCount})</span>
                          </button>
                        )}
                        {frozenCount > 0 && (
                          <button
                            onClick={() => handleDownload('FROZEN')}
                            className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm font-medium transition-all flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            <span>Frozen ({frozenCount})</span>
                          </button>
                        )}
                        {activeCount > 0 && (
                          <button
                            onClick={() => handleDownload('ACTIVE')}
                            className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-all flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            <span>Active ({activeCount})</span>
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((result, index) => {
                if (result === null) {
                  return (
                    <div
                      key={index}
                      className="border border-white/10 rounded-xl p-5 bg-white/[0.02] flex items-center justify-center min-h-[200px] animate-pulse"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                        <span className="text-xs text-gray-400">
                          Validating {extractedSessions[index]?.name}...
                        </span>
                      </div>
                    </div>
                  );
                }
                const isRecentlyCompleted = recentlyCompleted.has(index);
                return (
                  <div 
                    key={index} 
                    className={`animate-slide-up transition-all duration-500 ${
                      isRecentlyCompleted ? 'ring-2 ring-green-500/50 scale-[1.02]' : ''
                    }`}
                    style={{ animationDelay: '0s' }}
                  >
                    <SessionResult
                      result={result}
                      sessionName={result.session_name || extractedSessions[index]?.name || `Session ${index + 1}`}
                    />
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

