import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, CheckCircle2, XCircle, Upload, Image as ImageIcon } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { API_BASE_URL, WS_BASE_URL } from '../config';

const ChangeProfilePicture = () => {
  const navigate = useNavigate();
  const [profileImage, setProfileImage] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(null);
  const [files, setFiles] = useState([]);
  const [extractedSessions, setExtractedSessions] = useState([]);
  const [extractionData, setExtractionData] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [userInfo, setUserInfo] = useState({});
  const [results, setResults] = useState({});
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      setProfileImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfileImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleRemoveImage = () => {
    setProfileImage(null);
    setProfileImagePreview(null);
  };

  const handleFileSelect = async (selectedFiles) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
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
      const response = await fetch(`${API_BASE_URL}/api/get-user-info', {
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
    } catch (err) {
      setError(err.message || 'Failed to fetch user info');
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const handleSave = async () => {
    if (!profileImage) {
      setError('Please select a profile picture first');
      return;
    }

    if (extractedSessions.length === 0) {
      setError('Please upload session files');
      return;
    }

    setIsUpdating(true);
    setError(null);
    setResults({});
    setProgress({ current: 0, total: extractedSessions.length, message: 'Starting profile picture update...' });

    try {
      // Convert image to base64 for transmission
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Image = e.target.result.split(',')[1];
        
        // Connect WebSocket
        const ws = new WebSocket(`${WS_BASE_URL}/ws/change-profile-pictures');
        wsRef.current = ws;
        
        ws.onopen = () => {
          // Send update request
          ws.send(JSON.stringify({
            image_data: base64Image,
            image_filename: profileImage.name,
            sessions: extractedSessions.map((session) => ({
              name: session.name,
              path: session.path
            }))
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
                current: data.current || prev.current,
                message: data.message || `Updating ${data.current || prev.current}/${prev.total}...`
              }));
              break;

            case 'result':
              setResults(prev => ({
                ...prev,
                [data.index]: data.result
              }));
              setProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                message: `Updated ${prev.current + 1}/${prev.total}`
              }));
              break;

            case 'complete':
              setProgress(prev => ({
                ...prev,
                message: data.message || 'All profile pictures updated!'
              }));
              setIsUpdating(false);
              ws.close();
              break;

            case 'error':
              setError(data.message);
              setIsUpdating(false);
              ws.close();
              break;
          }
        };

        ws.onerror = () => {
          setError('WebSocket connection error');
          setIsUpdating(false);
        };

        ws.onclose = () => {
          setIsUpdating(false);
        };
      };
      reader.readAsDataURL(profileImage);
    } catch (err) {
      setError(err.message || 'Failed to update profile pictures');
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
              Change Profile Picture
            </h1>
            <p className="text-sm text-gray-400">
              Upload a profile picture and set it on all accounts
            </p>
          </div>
        </div>

        {/* Profile Picture Upload Section */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-white mb-2">
            Select Profile Picture
          </label>
          {!profileImagePreview ? (
            <div className="border-2 border-dashed border-white/10 rounded-xl p-12 bg-white/[0.01] hover:border-white/20 transition-all">
              <input
                type="file"
                id="profile-image-upload"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <label
                htmlFor="profile-image-upload"
                className="flex flex-col items-center justify-center cursor-pointer"
              >
                <div className="p-4 rounded-full bg-white/5 mb-4">
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-white mb-1">
                  Click to upload profile picture
                </p>
                <p className="text-xs text-gray-500">
                  Supports JPG, PNG, GIF
                </p>
              </label>
            </div>
          ) : (
            <div className="relative inline-block">
              <img
                src={profileImagePreview}
                alt="Profile preview"
                className="w-32 h-32 rounded-lg object-cover border border-white/10"
              />
              <button
                onClick={handleRemoveImage}
                className="absolute -top-2 -right-2 p-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-full transition-colors"
              >
                <XCircle className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}
        </div>

        {/* Session Files Upload Section */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-white mb-2">
            Upload Session Files
          </label>
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
        )}

        {/* Sessions List */}
        {extractedSessions.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Sessions ({extractedSessions.length})
              </h2>
              {!isUpdating && profileImage && completedCount === 0 && (
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Update All Profile Pictures</span>
                </button>
              )}
            </div>

            {/* Progress Indicator */}
            {isUpdating && (
              <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">
                    {progress.message}
                  </span>
                  <span className="text-xs text-gray-400">
                    {progress.current} / {progress.total}
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
                  <span>Updating in real-time...</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {extractedSessions.map((session, index) => {
                const result = results[index];
                const info = userInfo[index];
                const hasResult = result !== undefined;
                const isSuccess = result?.success === true;
                const hasInfo = info?.success === true;
                const isUpdatingThis = isUpdating && !hasResult;

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border transition-all ${
                      hasResult
                        ? isSuccess
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                        : isUpdatingThis
                          ? 'bg-blue-500/10 border-blue-500/30'
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
                          {isUpdatingThis && (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                          )}
                        </div>
                        
                        {/* Current User Info */}
                        {hasInfo && (
                          <div className="mb-2 p-2 rounded bg-white/5 border border-white/5">
                            <div className="flex items-center gap-4 text-xs">
                              <div>
                                <span className="text-gray-500">Name: </span>
                                <span className="text-white">
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
                        
                        {isUpdatingThis && (
                          <p className="text-xs text-blue-400 mt-1">
                            Updating profile picture...
                          </p>
                        )}
                        {hasResult && !isSuccess && (
                          <p className="text-xs text-red-400 mt-1">{result.error}</p>
                        )}
                        {hasResult && isSuccess && (
                          <p className="text-xs text-green-400 mt-1">
                            Profile picture updated successfully
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {allUpdated && (
              <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <p className="text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  All profile pictures updated successfully!
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

export default ChangeProfilePicture;

