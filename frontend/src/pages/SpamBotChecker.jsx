import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Play, Shield, AlertTriangle, Clock, Ban } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { API_BASE_URL } from '../config';

const SpamBotChecker = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [extractedSessions, setExtractedSessions] = useState([]);
  const [extractionData, setExtractionData] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState([]);
  const [error, setError] = useState(null);

  const handleFileSelect = async (selectedFiles) => {
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

  const handleCheck = async () => {
    if (extractedSessions.length === 0) {
      setError('Please upload sessions first');
      return;
    }

    setIsChecking(true);
    setError(null);
    setCheckResults([]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/check-spambot', {
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
        let errorMessage = 'Failed to check SpamBot';
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
    } catch (err) {
      console.error('Check error:', err);
      setError(err.message || 'Failed to check SpamBot');
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'ACTIVE':
        return {
          icon: CheckCircle2,
          color: 'text-green-400',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/30',
          label: 'Active',
          description: 'Account is good, no limits applied'
        };
      case 'TEMP_LIMITED':
        return {
          icon: Clock,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
          label: 'Temporarily Limited',
          description: 'Account has time-based restrictions'
        };
      case 'HARD_LIMITED':
        return {
          icon: Ban,
          color: 'text-orange-400',
          bgColor: 'bg-orange-500/10',
          borderColor: 'border-orange-500/30',
          label: 'Hard Limited',
          description: 'Permanent spam limit applied'
        };
      case 'FROZEN':
        return {
          icon: XCircle,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          label: 'Frozen',
          description: 'Account blocked for ToS violations'
        };
      case 'UNKNOWN':
        return {
          icon: AlertTriangle,
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/30',
          label: 'Unknown',
          description: 'Response format not recognized'
        };
      case 'FAILED':
        return {
          icon: XCircle,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          label: 'Failed',
          description: 'Could not check account status'
        };
      default:
        return {
          icon: AlertTriangle,
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/30',
          label: status || 'Unknown',
          description: 'Unknown status'
        };
    }
  };

  const activeCount = checkResults.filter(r => r.status === 'ACTIVE').length;
  const tempLimitedCount = checkResults.filter(r => r.status === 'TEMP_LIMITED').length;
  const hardLimitedCount = checkResults.filter(r => r.status === 'HARD_LIMITED').length;
  const frozenCount = checkResults.filter(r => r.status === 'FROZEN').length;
  const failedCount = checkResults.filter(r => r.status === 'FAILED').length;

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
          <h1 className="text-3xl font-bold text-white mb-2">SpamBot Checker</h1>
          <p className="text-gray-400">Check account health status and spam limits using @SpamBot</p>
        </div>

        {/* Summary Statistics */}
        {checkResults.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-6 flex-wrap">
              {activeCount > 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{activeCount}</div>
                    <div className="text-xs text-gray-400">Active</div>
                  </div>
                </div>
              )}
              {tempLimitedCount > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{tempLimitedCount}</div>
                    <div className="text-xs text-gray-400">Temp Limited</div>
                  </div>
                </div>
              )}
              {hardLimitedCount > 0 && (
                <div className="flex items-center gap-2">
                  <Ban className="w-5 h-5 text-orange-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{hardLimitedCount}</div>
                    <div className="text-xs text-gray-400">Hard Limited</div>
                  </div>
                </div>
              )}
              {frozenCount > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{frozenCount}</div>
                    <div className="text-xs text-gray-400">Frozen</div>
                  </div>
                </div>
              )}
              {failedCount > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{failedCount}</div>
                    <div className="text-xs text-gray-400">Failed</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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

        {/* Extracted Sessions List */}
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
                <span>Check SpamBot</span>
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

        {/* Checking Progress */}
        {isChecking && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Checking account health status with @SpamBot...</span>
            </div>
            <div className="mt-2 text-sm text-gray-400">
              This may take a few seconds per session
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Check Results */}
        {checkResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checkResults.map((result, idx) => {
                const statusConfig = getStatusConfig(result.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <div
                    key={idx}
                    className={`p-5 rounded-lg border ${statusConfig.bgColor} ${statusConfig.borderColor}`}
                  >
                    <div className="flex items-center justify-between mb-4">
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

                    <div className="space-y-2">
                      <div className="text-sm text-gray-300">
                        {statusConfig.description}
                      </div>

                      {/* Show details if available */}
                      {result.details && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <div className="text-xs text-gray-400">
                            {result.status === 'TEMP_LIMITED' && result.details ? (
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                <span>Limited until: {result.details}</span>
                              </div>
                            ) : (
                              <div className="text-gray-500 font-mono break-all">
                                {result.details}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Show error if failed */}
                      {!result.success && result.details && (
                        <div className="text-xs text-red-400 mt-2">
                          Error: {result.details}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {extractedSessions.length > 0 && !isChecking && checkResults.length === 0 && (
          <div className="mb-8 p-8 rounded-lg bg-white/[0.02] border border-white/10 text-center">
            <div className="text-gray-400">
              Upload sessions and click "Check SpamBot" to get account health status.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpamBotChecker;

