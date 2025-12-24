import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Play, Square, Copy, Clock, Key, Lock } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { API_BASE_URL, WS_BASE_URL } from '../config';

const CodeExtractor = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [extractedSessions, setExtractedSessions] = useState([]);
  const [extractionData, setExtractionData] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [codes, setCodes] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const handleFileSelect = async (selectedFiles) => {
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
      const allSessions = [];
      const allExtractionData = [];

      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/api/extract-sessions', {
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
    } catch (err) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleStartListening = () => {
    if (!selectedSession) {
      setError('Please select a session first');
      return;
    }

    setIsListening(true);
    setError(null);
    setCodes([]);
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    
    // Start timer
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    // Connect WebSocket
    const ws = new WebSocket(`${WS_BASE_URL}/ws/listen-codes');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        session_path: selectedSession.path
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'started':
          // Listening started successfully
          break;

        case 'code_received':
          // Add new code to the list
          setCodes(prev => {
            // Check for duplicates
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

    ws.onerror = (err) => {
      setError('WebSocket connection error');
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

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      // Could add toast notification here
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString();
    } catch {
      return 'Unknown';
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
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

  // Stop listening if session changes
  useEffect(() => {
    if (isListening && selectedSession) {
      handleStopListening();
    }
  }, [selectedSession]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Background pattern */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">Login / Auth Code Extractor</h1>
          <p className="text-gray-400">Listen for incoming Telegram login and auth codes</p>
        </div>

        {/* File Upload Section */}
        <div className="mb-8">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-4 flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions...</span>
            </div>
          )}
        </div>

        {/* Session Selection */}
        {extractedSessions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Select Session</h2>
            <div className="space-y-2">
              {extractedSessions.map((session, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (!isListening) {
                      setSelectedSession(session);
                      setCodes([]);
                      setError(null);
                    }
                  }}
                  disabled={isListening}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${
                    selectedSession?.path === session.path
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.03]'
                  } ${
                    isListening ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">
                        {session.name || `Session ${idx + 1}`}
                      </div>
                      {selectedSession?.path === session.path && (
                        <div className="text-sm text-blue-400 mt-1">
                          ✓ Selected
                        </div>
                      )}
                    </div>
                    {selectedSession?.path === session.path && (
                      <CheckCircle2 className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Session Display */}
        {selectedSession && (
          <div className="mb-8">
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-5 h-5 text-blue-400" />
                <span className="text-white font-medium">Selected Session:</span>
              </div>
              <div className="text-gray-300 font-mono">{selectedSession.name}</div>
            </div>
          </div>
        )}

        {/* Start/Stop Listening */}
        {selectedSession && !isListening && (
          <div className="mb-8">
            <button
              onClick={handleStartListening}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              <span>Start Listening</span>
            </button>
          </div>
        )}

        {/* Listening Status */}
        {isListening && (
          <div className="mb-8">
            <div className="p-6 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-white font-medium">Status: Waiting for incoming codes…</span>
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <Clock className="w-5 h-5" />
                  <span className="font-mono">{formatTime(elapsedTime)}</span>
                </div>
              </div>
              <button
                onClick={handleStopListening}
                className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-all flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" />
                <span>Stop Listening</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Codes Display */}
        {codes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              Received Codes ({codes.length})
            </h2>
            <div className="space-y-4">
              {codes.map((codeData, idx) => {
                const isLoginCode = codeData.type === 'LOGIN_CODE';
                const Icon = isLoginCode ? Key : Lock;
                const typeLabel = isLoginCode ? 'Login Code' : 'Web Auth Code';
                
                return (
                  <div
                    key={idx}
                    className={`p-5 rounded-lg border ${
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
                    <div className="mb-2">
                      <div className="text-2xl font-bold text-white font-mono mb-1">
                        {codeData.code}
                      </div>
                      <div className="text-xs text-gray-400">
                        Received at: {formatTimestamp(codeData.received_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {selectedSession && !isListening && codes.length === 0 && (
          <div className="mb-8 p-8 rounded-lg bg-white/[0.02] border border-white/10 text-center">
            <div className="text-gray-400">
              Select a session and click "Start Listening" to begin monitoring for codes.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeExtractor;

