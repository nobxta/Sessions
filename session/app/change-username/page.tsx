'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, CheckCircle2, XCircle } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { API_BASE_URL } from '@/lib/config';

export default function ChangeUsername() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [usernameInputs, setUsernameInputs] = useState<Record<number, string>>({});
  const [userInfo, setUserInfo] = useState<Record<number, any>>({});
  const [results, setResults] = useState<Record<number, any>>({});
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setUsernameInputs({});
      setResults({});
      setError(null);
      return;
    }

    setFiles(fileArray);
    setResults({});
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
      
      const initialInputs: Record<number, string> = {};
      allSessions.forEach((session, index) => {
        initialInputs[index] = '';
      });
      setUsernameInputs(initialInputs);
      
      await fetchUserInfo(allSessions);
    } catch (err: any) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const fetchUserInfo = async (sessions: any[]) => {
    if (sessions.length === 0) return;
    
    setIsLoadingInfo(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/get-user-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessions }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const data = await response.json();
      setUserInfo(data.results || {});
      
      const currentUsernames: Record<number, string> = {};
      Object.entries(data.results || {}).forEach(([index, info]: [string, any]) => {
        if (info.success && info.username) {
          currentUsernames[parseInt(index)] = info.username;
        }
      });
      setUsernameInputs(prev => ({ ...prev, ...currentUsernames }));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch user info');
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const handleUsernameChange = (index: number, value: string) => {
    const cleanValue = value.replace('@', '');
    setUsernameInputs(prev => ({
      ...prev,
      [index]: cleanValue
    }));
  };

  const handleSave = async () => {
    if (extractedSessions.length === 0) return;

    setIsUpdating(true);
    setError(null);
    setResults({});

    try {
      const updateData = {
        sessions: extractedSessions.map((session, index) => ({
          name: session.name,
          path: session.path,
          new_username: usernameInputs[index]?.trim() || ''
        })),
        extraction_data: extractionData
      };

      const response = await fetch(`${API_BASE_URL}/api/change-usernames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update usernames');
      }

      const data = await response.json();
      setResults(data.results || {});
    } catch (err: any) {
      setError(err.message || 'Failed to update usernames');
    } finally {
      setIsUpdating(false);
    }
  };

  const allUpdated = Object.keys(results).length === extractedSessions.length && 
                     Object.values(results).every(r => r.success);
  
  const totalSessions = extractedSessions.length;
  const completedCount = Object.keys(results).length;
  const successCount = Object.values(results).filter(r => r?.success === true).length;
  const failureCount = completedCount - successCount;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Change Username
            </h1>
            <p className="text-sm text-gray-400">
              Upload session files and update usernames for all accounts
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

        {completedCount > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{successCount}</div>
                    <div className="text-xs text-gray-400">Success</div>
                  </div>
                </div>
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
                    <div className="text-2xl font-bold text-white">{totalSessions}</div>
                    <div className="text-xs text-gray-400">Total</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {extractedSessions.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Sessions ({extractedSessions.length})
              </h2>
              {!isUpdating && (
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save All Usernames</span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              {extractedSessions.map((session, index) => {
                const result = results[index];
                const info = userInfo[index];
                const hasResult = result !== undefined;
                const isSuccess = result?.success === true;
                const hasInfo = info?.success === true;

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border transition-all ${
                      hasResult
                        ? isSuccess
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                        : 'bg-white/[0.02] border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-mono text-gray-300">{session.name}</span>
                          {hasResult && (
                            isSuccess ? (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )
                          )}
                        </div>
                        
                        {hasInfo && (
                          <div className="mb-2 p-2 rounded bg-white/5 border border-white/5">
                            <div className="flex items-center gap-4 text-xs">
                              <div>
                                <span className="text-gray-500">Current Username: </span>
                                <span className="text-white font-medium">
                                  {info.username ? `@${info.username}` : 'Not set'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">User ID: </span>
                                <span className="text-white font-mono">{info.user_id}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {isLoadingInfo && !hasInfo && (
                          <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Loading user info...</span>
                          </div>
                        )}
                        
                        {!isLoadingInfo && !hasInfo && info && (
                          <div className="mb-2 text-xs text-red-400">
                            {info.error || 'Failed to load user info'}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">@</span>
                          <input
                            type="text"
                            value={usernameInputs[index] || ''}
                            onChange={(e) => handleUsernameChange(index, e.target.value)}
                            placeholder={hasInfo ? `Enter new username (current: ${info.username ? '@' + info.username : 'not set'})` : "Enter new username"}
                            disabled={isUpdating || isSuccess}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30 disabled:opacity-50"
                          />
                        </div>
                        {hasResult && !isSuccess && (
                          <p className="text-xs text-red-400 mt-1">{result.error}</p>
                        )}
                        {hasResult && isSuccess && (
                          <p className="text-xs text-green-400 mt-1">
                            Updated to: {result.new_username ? `@${result.new_username}` : 'Removed'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {isUpdating && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Updating usernames in parallel...</span>
              </div>
            )}

            {allUpdated && (
              <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <p className="text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  All usernames updated successfully!
                </p>
              </div>
            )}
          </div>
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

