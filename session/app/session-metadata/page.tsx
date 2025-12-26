'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Play, Phone, User, UserCircle, Crown, Globe, Shield, Image as ImageIcon, Lock, Calendar, Database } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import { API_BASE_URL } from '@/lib/config';

export default function SessionMetadataViewer() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [metadataResults, setMetadataResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setMetadataResults([]);
      setError(null);
      return;
    }

    setFiles(fileArray);
    setMetadataResults([]);
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

  const handleViewMetadata = async () => {
    if (extractedSessions.length === 0) {
      setError('Please upload sessions first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setMetadataResults([]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/session-metadata`, {
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
        let errorMessage = 'Failed to extract metadata';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setMetadataResults(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to extract metadata');
    } finally {
      setIsLoading(false);
    }
  };

  const MetadataField = ({ icon: Icon, label, value, valueColor = "text-white" }: { icon: any; label: string; value: any; valueColor?: string }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-400 mb-0.5">{label}</div>
        <div className={`text-sm font-medium ${valueColor} break-words`}>
          {value || 'Not set'}
        </div>
      </div>
    </div>
  );

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
          <h1 className="text-3xl font-bold text-white mb-2">Session Metadata Viewer</h1>
          <p className="text-gray-400">View read-only metadata for uploaded sessions</p>
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

        {extractedSessions.length > 0 && !isLoading && metadataResults.length === 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Sessions ({extractedSessions.length})
              </h2>
              <button
                onClick={handleViewMetadata}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>View Metadata</span>
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {extractedSessions.map((session, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/10 text-sm text-gray-300 font-mono">
                  {session.name || `Session ${idx + 1}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Extracting metadata from sessions...</span>
            </div>
            <div className="mt-2 text-sm text-gray-400">
              This operation is read-only and will not modify any accounts
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {metadataResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Metadata Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metadataResults.map((result, idx) => {
                if (!result.success) {
                  return (
                    <div key={idx} className="p-5 rounded-lg bg-red-500/10 border border-red-500/30">
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle className="w-5 h-5 text-red-400" />
                        <span className="text-white font-medium">
                          {result.session_name || extractedSessions[idx]?.name || `Session ${idx + 1}`}
                        </span>
                      </div>
                      <div className="text-sm text-red-400">
                        {result.error || 'Failed to extract metadata'}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="p-5 rounded-lg bg-white/[0.02] border border-white/10">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                        <span className="text-white font-medium">
                          {result.session_name || extractedSessions[idx]?.name || `Session ${idx + 1}`}
                        </span>
                      </div>
                      {result.premium === 'Yes' && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/20 border border-yellow-500/30">
                          <Crown className="w-4 h-4 text-yellow-400" />
                          <span className="text-xs text-yellow-400 font-semibold">Premium</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <MetadataField icon={Phone} label="Phone Number" value={result.phone_number} />
                      <MetadataField icon={Database} label="User ID" value={result.user_id?.toString()} valueColor="text-gray-300 font-mono" />
                      <MetadataField icon={User} label="First Name" value={result.first_name} />
                      <MetadataField icon={User} label="Last Name" value={result.last_name} />
                      <MetadataField icon={UserCircle} label="Username" value={result.username} />
                      <MetadataField 
                        icon={Crown} 
                        label="Premium" 
                        value={result.premium} 
                        valueColor={result.premium === 'Yes' ? 'text-yellow-400' : 'text-gray-400'}
                      />
                      <MetadataField icon={Globe} label="Language Code" value={result.language_code} />
                      <MetadataField icon={Database} label="DC ID" value={result.dc_id?.toString()} valueColor="text-gray-300 font-mono" />
                      <MetadataField 
                        icon={ImageIcon} 
                        label="Profile Photo" 
                        value={result.profile_photo} 
                        valueColor={result.profile_photo === 'Set' ? 'text-green-400' : 'text-gray-400'}
                      />
                      <MetadataField 
                        icon={Lock} 
                        label="2FA Enabled" 
                        value={result.two_factor_enabled} 
                        valueColor={result.two_factor_enabled === 'Yes' ? 'text-green-400' : result.two_factor_enabled === 'No' ? 'text-gray-400' : 'text-yellow-400'}
                      />
                      {result.account_creation_year && (
                        <MetadataField icon={Calendar} label="Account Creation Year" value={result.account_creation_year.toString()} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {extractedSessions.length > 0 && !isLoading && metadataResults.length === 0 && (
          <div className="mb-8 p-8 rounded-lg bg-white/[0.02] border border-white/10 text-center">
            <div className="text-gray-400">
              Upload sessions and click "View Metadata" to see session information.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

