import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, CheckCircle2, XCircle } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { API_BASE_URL } from '../config';

const ChangeName = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [extractedSessions, setExtractedSessions] = useState([]);
  const [extractionData, setExtractionData] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [nameInputs, setNameInputs] = useState({});
  const [userInfo, setUserInfo] = useState({});
  const [results, setResults] = useState({});
  const [error, setError] = useState(null);

  const handleFileSelect = async (selectedFiles) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setNameInputs({});
      setResults({});
      setError(null);
      return;
    }

    setFiles(fileArray);
    setResults({});
    setError(null);
    setIsExtracting(true);

    try {
      const allSessions = [];
      const allExtractionData = [];

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
      
      // Initialize name inputs with empty strings
      const initialInputs = {};
      allSessions.forEach((session, index) => {
        initialInputs[index] = '';
      });
      setNameInputs(initialInputs);
      
      // Fetch user info for all sessions
      await fetchUserInfo(allSessions);
    } catch (err) {
      setError(err.message || 'Failed to extract sessions');
    } finally {
      setIsExtracting(false);
    }
  };

  const fetchUserInfo = async (sessions) => {
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
      
      // Pre-fill inputs with current first names
      const currentNames = {};
      Object.entries(data.results || {}).forEach(([index, info]) => {
        if (info.success && info.first_name) {
          currentNames[index] = info.first_name;
        }
      });
      setNameInputs(prev => ({ ...prev, ...currentNames }));
    } catch (err) {
      setError(err.message || 'Failed to fetch user info');
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const handleNameChange = (index, value) => {
    setNameInputs(prev => ({
      ...prev,
      [index]: value
    }));
  };

  const handleSave = async () => {
    if (extractedSessions.length === 0) return;

    // Check if all sessions have names
    const missingNames = extractedSessions
      .map((_, index) => ({ index, name: nameInputs[index]?.trim() }))
      .filter(({ name }) => !name);

    if (missingNames.length > 0) {
      setError(`Please enter names for all ${missingNames.length} session(s)`);
      return;
    }

    setIsUpdating(true);
    setError(null);
    setResults({});

    try {
      // Prepare update request
      const updateData = {
        sessions: extractedSessions.map((session, index) => ({
          name: session.name,
          path: session.path,
          new_first_name: nameInputs[index]?.trim() || ''
        })),
        extraction_data: extractionData
      };

      const response = await fetch(`${API_BASE_URL}/api/change-names`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update names');
      }

      const data = await response.json();
      setResults(data.results || {});
    } catch (err) {
      setError(err.message || 'Failed to update names');
    } finally {
      setIsUpdating(false);
    }
  };

  const allUpdated = Object.keys(results).length === extractedSessions.length && 
                     Object.values(results).every(r => r.success);
  
  // Calculate statistics
  const totalSessions = extractedSessions.length;
  const completedCount = Object.keys(results).length;
  const successCount = Object.values(results).filter(r => r?.success === true).length;
  const failureCount = completedCount - successCount;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Subtle background pattern */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Change Name
            </h1>
            <p className="text-sm text-gray-400">
              Upload session files and update display names for all accounts
            </p>
          </div>
        </div>

        {/* File Upload Section */}
        <div className="mb-8">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          
          {isExtracting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions from {files.length} file{files.length !== 1 ? 's' : ''}...</span>
            </div>
          )}
        </div>

        {/* Summary Statistics */}
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

        {/* Sessions List with Name Inputs */}
        {extractedSessions.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Sessions ({extractedSessions.length})
              </h2>
              {!isUpdating && (
                <button
                  onClick={handleSave}
                  disabled={Object.keys(nameInputs).length === 0}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save All Names</span>
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
                        
                        {/* Current User Info */}
                        {hasInfo && (
                          <div className="mb-2 p-2 rounded bg-white/5 border border-white/5">
                            <div className="flex items-center gap-4 text-xs">
                              <div>
                                <span className="text-gray-500">Current Name: </span>
                                <span className="text-white font-medium">
                                  {info.first_name} {info.last_name || ''}
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
                        
                        <input
                          type="text"
                          value={nameInputs[index] || ''}
                          onChange={(e) => handleNameChange(index, e.target.value)}
                          placeholder={hasInfo ? `Enter new name (current: ${info.first_name})` : "Enter new display name"}
                          disabled={isUpdating || isSuccess}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30 disabled:opacity-50"
                        />
                        {hasResult && !isSuccess && (
                          <p className="text-xs text-red-400 mt-1">{result.error}</p>
                        )}
                        {hasResult && isSuccess && (
                          <p className="text-xs text-green-400 mt-1">
                            Updated to: {result.new_name}
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
                <span>Updating names in parallel...</span>
              </div>
            )}

            {allUpdated && (
              <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <p className="text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  All names updated successfully!
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangeName;

