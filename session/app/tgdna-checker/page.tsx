'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Play, Calendar, Crown, AlertTriangle, User } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { API_BASE_URL } from '@/lib/config';

export default function TGDNAChecker() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setCheckResults([]);
      setError(null);
      return;
    }

    setFiles(fileArray);
    setCheckResults([]);
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

  const handleCheck = async () => {
    if (extractedSessions.length === 0) {
      setError('Please upload sessions first');
      return;
    }

    setIsChecking(true);
    setError(null);
    setCheckResults([]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/check-tgdna`, {
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
        let errorMessage = 'Failed to check TG DNA';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setCheckResults(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to check TG DNA');
    } finally {
      setIsChecking(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const [year, month] = dateString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    } catch {
      return dateString;
    }
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
          <button
            onClick={() => router.push('/')}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">Age Checker, Creation year</h1>
          <p className="text-gray-400">Check account age, premium status, and labels using @TGDNAbot</p>
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

        {extractedSessions.length > 0 && !isChecking && checkResults.length === 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Sessions ({extractedSessions.length})
              </h2>
              <button
                onClick={handleCheck}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Check TG DNA</span>
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

        {isChecking && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Checking account information with @TGDNAbot...</span>
            </div>
            <div className="mt-2 text-sm text-gray-400">
              This may take a few seconds per session
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {checkResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checkResults.map((result, idx) => {
                if (!result.success) {
                  return (
                    <div key={idx} className="p-5 rounded-lg bg-red-500/10 border border-red-500/30">
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle className="w-5 h-5 text-red-400" />
                        <span className="text-white font-medium">
                          {extractedSessions[idx]?.name || `Session ${idx + 1}`}
                        </span>
                      </div>
                      <div className="text-sm text-red-400">
                        {result.error || 'Failed to check'}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="p-5 rounded-lg bg-white/[0.02] border border-white/10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                        <span className="text-white font-medium">
                          {extractedSessions[idx]?.name || `Session ${idx + 1}`}
                        </span>
                      </div>
                      {result.premium && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/20 border border-yellow-500/30">
                          <Crown className="w-4 h-4 text-yellow-400" />
                          <span className="text-xs text-yellow-400 font-semibold">Premium</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      {result.created && (
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-blue-400" />
                          <div>
                            <div className="text-xs text-gray-400">Created</div>
                            <div className="text-sm text-white font-medium">
                              {formatDate(result.created)}
                            </div>
                            <div className="text-xs text-gray-500">{result.created}</div>
                          </div>
                        </div>
                      )}

                      {result.account_age && (
                        <div className="flex items-center gap-3">
                          <User className="w-4 h-4 text-green-400" />
                          <div>
                            <div className="text-xs text-gray-400">Account Age</div>
                            <div className="text-sm text-white font-medium">
                              {result.account_age}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <Crown className="w-4 h-4 text-yellow-400" />
                        <div>
                          <div className="text-xs text-gray-400">Premium</div>
                          <div className={`text-sm font-medium ${
                            result.premium ? 'text-yellow-400' : 'text-gray-400'
                          }`}>
                            {result.premium ? 'Active' : 'Inactive'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                        {result.scam && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 border border-red-500/30">
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            <span className="text-xs text-red-400 font-semibold">Scam</span>
                          </div>
                        )}
                        {result.fake && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded bg-orange-500/20 border border-orange-500/30">
                            <AlertTriangle className="w-3 h-3 text-orange-400" />
                            <span className="text-xs text-orange-400 font-semibold">Fake</span>
                          </div>
                        )}
                        {!result.scam && !result.fake && (
                          <div className="text-xs text-gray-500">No labels</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {extractedSessions.length > 0 && !isChecking && checkResults.length === 0 && (
          <div className="mb-8 p-8 rounded-lg bg-white/[0.02] border border-white/10 text-center">
            <div className="text-gray-400">
              Upload sessions and click "Check TG DNA" to get account information.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

