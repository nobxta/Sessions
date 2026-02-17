'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Copy, Download, FileText, Code, ArrowRightLeft } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import PageHelpLink from '@/components/PageHelpLink';
import { API_BASE_URL } from '@/lib/config';

export default function SessionConverter() {
  const router = useRouter();
  const [mode, setMode] = useState<'to-string' | 'to-session'>('to-string');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResults, setConversionResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionStrings, setSessionStrings] = useState<Array<{ name: string; string: string }>>([{ name: '', string: '' }]);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setConversionResults([]);
      setError(null);
      return;
    }

    setFiles(fileArray);
    setConversionResults([]);
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

  const handleConvertToStrings = async () => {
    if (extractedSessions.length === 0) {
      setError('Please upload sessions first');
      return;
    }

    setIsConverting(true);
    setError(null);
    setConversionResults([]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions-to-strings`, {
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
        let errorMessage = 'Failed to convert sessions';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setConversionResults(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to convert sessions to strings');
    } finally {
      setIsConverting(false);
    }
  };

  const handleConvertToSessions = async () => {
    const validStrings = sessionStrings
      .map(s => ({ name: s.name.trim(), string: s.string.trim() }))
      .filter(s => s.name && s.string);

    if (validStrings.length === 0) {
      setError('Please provide at least one valid session string');
      return;
    }

    setIsConverting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/strings-to-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_strings: validStrings,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to convert strings';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `converted_sessions_${new Date().getTime()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to convert strings to sessions');
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopyString = (string: string) => {
    navigator.clipboard.writeText(string).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const handleAddStringField = () => {
    setSessionStrings([...sessionStrings, { name: '', string: '' }]);
  };

  const handleRemoveStringField = (index: number) => {
    if (sessionStrings.length > 1) {
      setSessionStrings(sessionStrings.filter((_, i) => i !== index));
    }
  };

  const handleStringChange = (index: number, field: 'name' | 'string', value: string) => {
    const newStrings = [...sessionStrings];
    newStrings[index][field] = value;
    setSessionStrings(newStrings);
  };

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
            <PageHelpLink href="/docs/session-converter" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Session Converter</h1>
          <p className="text-gray-400">Convert between session files and string format</p>
        </div>

        <div className="mb-8">
          <div className="flex gap-4 p-1 bg-white/5 rounded-lg border border-white/10">
            <button
              onClick={() => {
                setMode('to-string');
                setConversionResults([]);
                setError(null);
              }}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'to-string'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Session → String</span>
            </button>
            <button
              onClick={() => {
                setMode('to-session');
                setConversionResults([]);
                setError(null);
              }}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'to-session'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Code className="w-4 h-4" />
              <span>String → Session</span>
            </button>
          </div>
        </div>

        {mode === 'to-string' && (
          <>
            <div className="mb-8">
              <FileUpload onFileSelect={handleFileSelect} multiple={true} />
              {isExtracting && (
                <div className="mt-4 flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Extracting sessions...</span>
                </div>
              )}
            </div>

            {extractedSessions.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">
                    Sessions ({extractedSessions.length})
                  </h2>
                  <button
                    onClick={handleConvertToStrings}
                    disabled={isConverting}
                    className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
                      isConverting
                        ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                        : 'bg-white/10 hover:bg-white/15 border border-white/20 text-white'
                    }`}
                  >
                    {isConverting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Converting...</span>
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>Convert to Strings</span>
                      </>
                    )}
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

            {conversionResults.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-4">Converted Strings</h2>
                <div className="space-y-4">
                  {conversionResults.map((result, idx) => {
                    if (!result.success) {
                      return (
                        <div key={idx} className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                          <div className="flex items-center gap-2 mb-2">
                            <XCircle className="w-5 h-5 text-red-400" />
                            <span className="text-white font-medium">{result.session}</span>
                          </div>
                          <div className="text-sm text-red-400">{result.error}</div>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                            <span className="text-white font-medium">{result.session}</span>
                            <span className="text-xs text-gray-400">({result.size} bytes)</span>
                          </div>
                          <button
                            onClick={() => handleCopyString(result.string)}
                            className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white transition-all flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </button>
                        </div>
                        <div className="p-3 rounded bg-black/20 border border-white/5">
                          <textarea
                            readOnly
                            value={result.string}
                            className="w-full bg-transparent text-xs text-gray-300 font-mono resize-none focus:outline-none"
                            rows={6}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'to-session' && (
          <>
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Session Strings</h2>
                <button
                  onClick={handleAddStringField}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white transition-all"
                >
                  + Add String
                </button>
              </div>
              <div className="space-y-4">
                {sessionStrings.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleStringChange(idx, 'name', e.target.value)}
                        placeholder="Session name (e.g., +1234567890)"
                        className="flex-1 px-3 py-2 bg-white/[0.02] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/20"
                      />
                      {sessionStrings.length > 1 && (
                        <button
                          onClick={() => handleRemoveStringField(idx)}
                          className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-all"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <textarea
                      value={item.string}
                      onChange={(e) => handleStringChange(idx, 'string', e.target.value)}
                      placeholder="Paste base64 session string here..."
                      className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-xs text-gray-300 font-mono placeholder-gray-500 focus:outline-none focus:border-white/20 resize-none"
                      rows={6}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <button
                onClick={handleConvertToSessions}
                disabled={isConverting}
                className={`w-full px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  isConverting
                    ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white'
                }`}
              >
                {isConverting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>Convert to Sessions & Download</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

