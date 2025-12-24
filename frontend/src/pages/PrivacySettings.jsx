import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, CheckCircle2, XCircle, Lock, AlertTriangle } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { API_BASE_URL } from '../config';

const PRIVACY_SETTINGS = [
  {
    id: 'InputPrivacyKeyPhoneNumber',
    label: 'Phone Number',
    description: 'Who can see your phone number'
  },
  {
    id: 'InputPrivacyKeyStatusTimestamp',
    label: 'Last Seen & Online',
    description: 'Who can see when you were last seen'
  },
  {
    id: 'InputPrivacyKeyProfilePhoto',
    label: 'Profile Photos',
    description: 'Who can see your profile photos'
  },
  {
    id: 'InputPrivacyKeyForwards',
    label: 'Forwarded Messages',
    description: 'Who can forward your messages'
  },
  {
    id: 'InputPrivacyKeyPhoneCalls',
    label: 'Calls',
    description: 'Who can call you'
  },
  {
    id: 'InputPrivacyKeyVoiceMessages',
    label: 'Voice Messages',
    description: 'Who can send you voice messages'
  },
  {
    id: 'InputPrivacyKeyMessages',
    label: 'Messages',
    description: 'Who can send you messages'
  },
  {
    id: 'InputPrivacyKeyBirthday',
    label: 'Birthday',
    description: 'Who can see your birthday'
  },
  {
    id: 'InputPrivacyKeyGifts',
    label: 'Gifts',
    description: 'Who can see your gifts'
  },
  {
    id: 'InputPrivacyKeyAbout',
    label: 'Bio',
    description: 'Who can see your bio'
  },
  {
    id: 'InputPrivacyKeySavedMusic',
    label: 'Saved Music',
    description: 'Who can see your saved music'
  },
  {
    id: 'InputPrivacyKeyChatInvite',
    label: 'Groups & Channels',
    description: 'Who can add you to groups and channels'
  }
];

const PRIVACY_OPTIONS = [
  { value: 'Everybody', label: 'Everybody' },
  { value: 'My Contacts', label: 'My Contacts' },
  { value: 'Nobody', label: 'Nobody' }
];

const PrivacySettings = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [extractedSessions, setExtractedSessions] = useState([]);
  const [extractionData, setExtractionData] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  
  // State for privacy settings: { settingId: { enabled: bool, value: string } }
  const [privacySettings, setPrivacySettings] = useState({});

  const handleFileSelect = async (selectedFiles) => {
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

  const handleToggleSetting = (settingId) => {
    setPrivacySettings(prev => {
      const newSettings = { ...prev };
      if (newSettings[settingId]?.enabled) {
        // Disable: remove the setting
        delete newSettings[settingId];
      } else {
        // Enable: add with default value
        newSettings[settingId] = {
          enabled: true,
          value: 'My Contacts' // Default value
        };
      }
      return newSettings;
    });
  };

  const handleSettingValueChange = (settingId, value) => {
    setPrivacySettings(prev => ({
      ...prev,
      [settingId]: {
        ...prev[settingId],
        value: value
      }
    }));
  };

  const handleApply = async () => {
    if (extractedSessions.length === 0) {
      setError('Please upload session files first');
      return;
    }

    // Check if at least one toggle is enabled
    const enabledSettings = Object.keys(privacySettings).filter(
      key => privacySettings[key]?.enabled
    );

    if (enabledSettings.length === 0) {
      setError('Please enable at least one privacy setting to apply');
      return;
    }

    setIsApplying(true);
    setError(null);
    setResults([]);

    try {
      // Build settings object: only include enabled settings
      const settings = {};
      enabledSettings.forEach(settingId => {
        settings[settingId] = privacySettings[settingId].value;
      });

      // Prepare request: apply same settings to all sessions
      const sessions = extractedSessions.map(session => ({
        path: session.path,
        settings: settings
      }));

      const response = await fetch(`${API_BASE_URL}/api/privacy-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessions }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to apply privacy settings');
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err.message || 'Failed to apply privacy settings');
    } finally {
      setIsApplying(false);
    }
  };

  const enabledCount = Object.keys(privacySettings).filter(
    key => privacySettings[key]?.enabled
  ).length;

  const successCount = results.filter(r => r?.success === true).length;
  const failureCount = results.filter(r => r?.success === false).length;

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
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              Privacy Settings Manager
            </h1>
            <p className="text-sm text-gray-400">
              Manage Telegram privacy settings for multiple sessions
            </p>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <p className="font-medium mb-1">Privacy changes apply immediately</p>
            <p className="text-yellow-300/80">
              Changes will affect account visibility and who can interact with your accounts. 
              Only enabled settings will be modified.
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

          {extractedSessions.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-white/[0.02] border border-white/10">
              <p className="text-sm text-gray-300">
                <span className="font-medium text-white">{extractedSessions.length}</span> session{extractedSessions.length !== 1 ? 's' : ''} ready
              </p>
            </div>
          )}
        </div>

        {/* Privacy Settings */}
        {extractedSessions.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Privacy Settings</h2>
              <div className="text-sm text-gray-400">
                {enabledCount} of {PRIVACY_SETTINGS.length} enabled
              </div>
            </div>

            <div className="space-y-3">
              {PRIVACY_SETTINGS.map((setting) => {
                const isEnabled = privacySettings[setting.id]?.enabled || false;
                const selectedValue = privacySettings[setting.id]?.value || 'My Contacts';

                return (
                  <div
                    key={setting.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isEnabled
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-white/[0.02] border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <Lock className={`w-5 h-5 flex-shrink-0 ${isEnabled ? 'text-blue-400' : 'text-gray-500'}`} />
                          <div>
                            <h3 className="text-base font-medium text-white">{setting.label}</h3>
                            <p className="text-xs text-gray-400 mt-0.5">{setting.description}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Toggle Switch */}
                        <button
                          onClick={() => handleToggleSetting(setting.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isEnabled ? 'bg-blue-500' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              isEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>

                        {/* Dropdown (only shown when enabled) */}
                        {isEnabled && (
                          <select
                            value={selectedValue}
                            onChange={(e) => handleSettingValueChange(setting.id, e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                          >
                            {PRIVACY_OPTIONS.map(option => (
                              <option key={option.value} value={option.value} className="bg-[#0f0f15]">
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Apply Button */}
            <div className="mt-6">
              <button
                onClick={handleApply}
                disabled={isApplying || enabledCount === 0}
                className={`w-full px-6 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  isApplying || enabledCount === 0
                    ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                }`}
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Applying Privacy Settings...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Apply Privacy Settings to {extractedSessions.length} Session{extractedSessions.length !== 1 ? 's' : ''}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Results</h2>
              <div className="flex items-center gap-4">
                {successCount > 0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <span className="text-sm text-gray-300">{successCount} success</span>
                  </div>
                )}
                {failureCount > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-400" />
                    <span className="text-sm text-gray-300">{failureCount} failed</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {results.map((result, index) => {
                const sessionName = extractedSessions[index]?.name || `Session ${index + 1}`;
                const isSuccess = result?.success === true;

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border ${
                      isSuccess
                        ? 'bg-green-500/10 border-green-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {isSuccess ? (
                            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                          )}
                          <span className="font-medium text-white">{sessionName}</span>
                        </div>
                        {isSuccess && result.applied_settings && (
                          <div className="mt-2 text-sm text-gray-300">
                            <p className="text-xs text-gray-400 mb-1">Applied settings:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {result.applied_settings.map((setting, idx) => (
                                <li key={idx} className="text-xs">
                                  {PRIVACY_SETTINGS.find(s => s.id === setting.key)?.label || setting.key}: {setting.value}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {!isSuccess && result.error && (
                          <p className="mt-2 text-sm text-red-300">{result.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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

export default PrivacySettings;

