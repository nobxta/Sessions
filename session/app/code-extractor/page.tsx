'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Play, Square, Copy, Clock, Key, Lock } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { API_BASE_URL, WS_BASE_URL } from '@/lib/config';

export default function CodeExtractor() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [isStartingScan, setIsStartingScan] = useState(false);
  const [codes, setCodes] = useState<Array<{ type: string; code: string; received_at: string }>>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setSelectedSession(null);
      setCodes([]);
      setError(null);
      return;
    }

    setFiles(fileArray);
    setSelectedSession(null);
    setCodes([]);
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

      // Remove duplicates based on session path
      const uniqueSessions = allSessions.filter((session, index, self) => 
        index === self.findIndex(s => s.path === session.path)
      );

      // Fetch user info for each session to display account name and user ID
      if (uniqueSessions.length > 0) {
        try {
          const userInfoResponse = await fetch(`${API_BASE_URL}/api/get-user-info`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessions: uniqueSessions.map(s => ({ name: s.name, path: s.path }))
            }),
          });

          if (userInfoResponse.ok) {
            const userInfoData = await userInfoResponse.json();
            const userInfoResults = userInfoData.results || {};
            
            // Enrich sessions with user info
            // Backend returns results as {0: {...}, 1: {...}} format
            const enrichedSessions = uniqueSessions.map((session, idx) => {
              const userInfo = userInfoResults[idx] || userInfoResults[String(idx)];
              return {
                ...session,
                userInfo: userInfo?.success ? {
                  first_name: userInfo.first_name || '',
                  last_name: userInfo.last_name || '',
                  user_id: userInfo.user_id || null,
                  phone: userInfo.phone || null,
                  username: userInfo.username || null,
                } : null
              };
            });
            
            setExtractedSessions(enrichedSessions);
            setExtractionData(allExtractionData);
            // Auto-select if only one session
            if (enrichedSessions.length === 1) {
              setSelectedSession(enrichedSessions[0]);
              setCodes([]);
              setError(null);
            }
          } else {
            // If user info fails, just use sessions without info
            setExtractedSessions(uniqueSessions);
            setExtractionData(allExtractionData);
            // Auto-select if only one session
            if (uniqueSessions.length === 1) {
              setSelectedSession(uniqueSessions[0]);
              setCodes([]);
              setError(null);
            }
          }
        } catch (err) {
          // If user info fails, just use sessions without info
          console.warn('Failed to fetch user info:', err);
          setExtractedSessions(uniqueSessions);
          setExtractionData(allExtractionData);
          // Auto-select if only one session
          if (uniqueSessions.length === 1) {
            setSelectedSession(uniqueSessions[0]);
            setCodes([]);
            setError(null);
          }
        }
      } else {
        setExtractedSessions(uniqueSessions);
        setExtractionData(allExtractionData);
        // Auto-select if only one session
        if (uniqueSessions.length === 1) {
          setSelectedSession(uniqueSessions[0]);
          setCodes([]);
          setError(null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleStartListening = (session: any) => {
    if (!session) {
      setError('Please select a session first');
      return;
    }

    // Prevent double-click spam
    if (isStartingScan || (isListening && selectedSession?.path === session.path)) {
      return;
    }

    setIsStartingScan(true);
    
    // Set selected session
    setSelectedSession(session);
    setIsListening(true);
    setError(null);
    setSuccess(null);
    setCodes([]);
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    const ws = new WebSocket(`${WS_BASE_URL}/ws/listen-codes`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        session_path: session.path
      }));
      // Show that scanning has started
      setSuccess('Started scanning for codes...');
      setIsStartingScan(false);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'code_received':
          setCodes(prev => {
            const exists = prev.some(c => 
              c.type === message.data.type && c.code === message.data.code
            );
            if (exists) return prev;
            return [message.data, ...prev];
          });
          break;

        case 'error':
          setError(message.message);
          handleStopListening();
          break;

        case 'stopped':
          handleStopListening();
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsStartingScan(false);
      handleStopListening();
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (isListening) {
        handleStopListening();
      }
    };
  };

  const handleStopListening = () => {
    setIsListening(false);
    setIsStartingScan(false);
    setSuccess(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
        wsRef.current.close();
      } catch {
        // Ignore errors
      }
      wsRef.current = null;
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString();
    } catch {
      return 'Unknown';
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore
        }
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isListening && selectedSession) {
      handleStopListening();
    }
  }, [selectedSession]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="mb-3 flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Login / Auth Code Extractor</h1>
          <p className="text-gray-400 text-sm">Listen for incoming Telegram login and auth codes</p>
        </div>

        <div className="mb-6">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-3 flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions...</span>
            </div>
          )}
        </div>

        {extractedSessions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {extractedSessions.length === 1 ? 'Session Ready' : `${extractedSessions.length} Sessions`}
              </h2>
              {extractedSessions.length > 0 && (
                <button
                  onClick={() => {
                    setFiles([]);
                    setExtractedSessions([]);
                    setSelectedSession(null);
                    setCodes([]);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Remove All</span>
                </button>
              )}
            </div>
            
            {/* Control Tile Grid */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 mb-6">
              {extractedSessions
                .filter((session, index, self) => 
                  index === self.findIndex(s => s.path === session.path)
                )
                .map((session, idx) => {
                  const isSelected = selectedSession?.path === session.path;
                  const isScanning = isListening && isSelected;
                  
                  // Get session name (phone number preferred)
                  const sessionName = session.userInfo?.phone || 
                                     session.name || 
                                     `Session ${idx + 1}`;
                  
                  // Get account name/username
                  const accountName = session.userInfo 
                    ? `${session.userInfo.first_name || ''} ${session.userInfo.last_name || ''}`.trim() || session.userInfo.username || ''
                    : '';
                  const username = session.userInfo?.username ? `@${session.userInfo.username}` : '';
                  const accountDisplay = accountName && username ? `${accountName} | ${username}` : accountName || username || '';
                  
                  const phoneNumber = session.userInfo?.phone || '';
                  
                  const handleCopyPhone = (e: React.MouseEvent) => {
                    e.stopPropagation(); // Prevent triggering scan
                    if (phoneNumber) {
                      navigator.clipboard.writeText(phoneNumber);
                      setSuccess(`Phone number copied: ${phoneNumber}`);
                      setTimeout(() => setSuccess(null), 2000);
                    }
                  };
                  
                  return (
                    <div
                      key={session.path || idx}
                      onClick={() => {
                        if (isScanning) {
                          // If already scanning this session, stop it
                          handleStopListening();
                        } else if (!isListening || isSelected) {
                          // Start scanning with this session
                          handleStartListening(session);
                        }
                      }}
                      className={`h-[140px] min-h-[140px] max-h-[160px] p-4 rounded-lg border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-blue-500/20 border-blue-500/50 ring-2 ring-blue-500/30'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      } ${
                        isListening && !isSelected ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {/* Top: Session name + Status pill */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-white text-base font-bold truncate flex-1 mr-2">
                          {sessionName}
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 flex-shrink-0 ${
                          isScanning 
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {isScanning ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Scanning</span>
                            </>
                          ) : (
                            <>
                              <div className="w-2 h-2 bg-green-400 rounded-full" />
                              <span>Ready</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Middle: Account name / username */}
                      {accountDisplay && (
                        <div className="text-white text-sm mb-3 truncate">
                          {accountDisplay}
                        </div>
                      )}
                      
                      {/* Bottom: Phone number + Copy icon */}
                      {phoneNumber && (
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/10">
                          <div className="text-gray-300 text-sm flex items-center gap-1.5">
                            <span>Phone:</span>
                            <span className="font-medium text-white">{phoneNumber}</span>
                          </div>
                          <button
                            onClick={handleCopyPhone}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                            title="Copy phone number"
                          >
                            <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}


        {isListening && (
          <div className="mb-6">
            <div className="p-5 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                  <div>
                    <div className="text-white font-semibold">Started Scanning</div>
                    <div className="text-sm text-gray-400">Waiting for incoming codes…</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <Clock className="w-5 h-5" />
                  <span className="font-mono font-semibold">{formatTime(elapsedTime)}</span>
                </div>
              </div>
              {selectedSession?.userInfo && (
                <div className="mb-3 p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-xs text-gray-400 mb-1">Monitoring Session</div>
                  <div className="text-white font-semibold">
                    {selectedSession.userInfo.first_name} {selectedSession.userInfo.last_name || ''}
                    {selectedSession.userInfo.phone && (
                      <span className="text-gray-400 text-sm ml-2">({selectedSession.userInfo.phone})</span>
                    )}
                  </div>
                </div>
              )}
              <button
                onClick={handleStopListening}
                className="w-full px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-all flex items-center justify-center gap-2 font-medium"
              >
                <Square className="w-4 h-4" />
                <span>Stop Scanning</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {success && !isListening && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
            {success}
          </div>
        )}

        {codes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              Received Codes ({codes.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {codes.map((codeData, idx) => {
                const isLoginCode = codeData.type === 'LOGIN_CODE';
                const Icon = isLoginCode ? Key : Lock;
                const typeLabel = isLoginCode ? 'Login Code' : 'Web Auth Code';
                
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      isLoginCode
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-purple-500/10 border-purple-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${isLoginCode ? 'text-blue-400' : 'text-purple-400'}`} />
                        <span className={`font-semibold ${isLoginCode ? 'text-blue-400' : 'text-purple-400'}`}>
                          Type: {typeLabel}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCopyCode(codeData.code)}
                        className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white transition-all flex items-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white font-mono mb-1">
                        {codeData.code}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatTimestamp(codeData.received_at)}
                      </div>
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


