'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Send, Key, Lock, Download, Shuffle, Plus } from 'lucide-react';
import PageHelpLink from '@/components/PageHelpLink';
import { API_BASE_URL } from '@/lib/config';

export default function SessionMaker() {
  const router = useRouter();
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [sessionPath, setSessionPath] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
  
  const [needs2FA, setNeeds2FA] = useState(false);
  const [password2FA, setPassword2FA] = useState('');
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  
  const [customFilename, setCustomFilename] = useState('');
  const [useRandomFilename, setUseRandomFilename] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  
  // Store multiple created sessions
  const [createdSessions, setCreatedSessions] = useState<Array<{
    sessionPath: string;
    filename: string;
    phoneNumber: string;
    createdAt: string;
  }>>([]);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetFlow = () => {
    setCurrentStep(1);
    setPhoneNumber('');
    setPhoneCodeHash('');
    setSessionPath('');
    setOtpCode('');
    setNeeds2FA(false);
    setPassword2FA('');
    setCustomFilename('');
    setUseRandomFilename(false);
    setError(null);
    setSuccess(null);
    setIsSendingOTP(false);
    setIsVerifyingOTP(false);
    setIsVerifying2FA(false);
    setIsCreatingSession(false);
  };

  const handleSendOTP = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setIsSendingOTP(true);
    setError(null);
    setSuccess(null);
    // Reset OTP code when requesting new OTP
    setOtpCode('');
    setNeeds2FA(false);
    setPassword2FA('');
    
    // Save old session path BEFORE clearing it (for cleanup)
    const oldSessionPath = sessionPath;
    
    // IMPORTANT: Clear old session path and phone_code_hash to force new request
    setPhoneCodeHash('');
    setSessionPath('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumber.trim(),
          old_session_path: oldSessionPath || null, // Send old session path to clean up
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send OTP');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      // IMPORTANT: Update both phone_code_hash AND session_path with new values
      setPhoneCodeHash(data.phone_code_hash);
      setSessionPath(data.session_path);
      setCurrentStep(2);
      setSuccess('OTP code sent! Check your Telegram app.');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim()) {
      setError('Please enter the OTP code');
      return;
    }

    // Validate that we have the required data
    if (!phoneCodeHash || !sessionPath) {
      setError('Session expired. Please request a new OTP code.');
      return;
    }

    setIsVerifyingOTP(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumber.trim(),
          phone_code_hash: phoneCodeHash,
          otp_code: otpCode.trim(),
          session_path: sessionPath,
          custom_filename: customFilename.trim() || null,
          use_random_filename: useRandomFilename,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to verify OTP');
      }

      if (data.needs_2fa) {
        setNeeds2FA(true);
        if (data.session_path) {
          setSessionPath(data.session_path);
        }
        setCurrentStep(3);
        setSuccess('OTP verified! 2FA password required.');
      } else if (data.success) {
        // Add session to the list
        const newSession = {
          sessionPath: data.session_path,
          filename: data.filename,
          phoneNumber: phoneNumber.trim(),
          createdAt: new Date().toISOString(),
        };
        setCreatedSessions(prev => [...prev, newSession]);
        setCurrentStep(4);
        setSuccess('Session created successfully!');
      } else {
        throw new Error(data.error || 'Failed to verify OTP');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP');
    } finally {
      setIsVerifyingOTP(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!password2FA.trim()) {
      setError('Please enter the 2FA password');
      return;
    }

    setIsVerifying2FA(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/verify-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_path: sessionPath,
          password_2fa: password2FA.trim(),
          custom_filename: customFilename.trim() || null,
          use_random_filename: useRandomFilename,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to verify 2FA');
      }

      if (data.success) {
        // Add session to the list
        const newSession = {
          sessionPath: data.session_path,
          filename: data.filename,
          phoneNumber: phoneNumber.trim(),
          createdAt: new Date().toISOString(),
        };
        setCreatedSessions(prev => [...prev, newSession]);
        setCurrentStep(4);
        setSuccess('Session created successfully with 2FA!');
      } else {
        throw new Error(data.error || 'Failed to verify 2FA');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify 2FA');
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleDownloadSession = async (sessionPath?: string, filename?: string) => {
    const targetPath = sessionPath || (createdSessions.length > 0 ? createdSessions[createdSessions.length - 1].sessionPath : '');
    const targetFilename = filename || (createdSessions.length > 0 ? createdSessions[createdSessions.length - 1].filename : '');
    
    if (!targetPath) {
      setError('No session file to download');
      return;
    }

    setIsCreatingSession(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/download-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_path: targetPath,
          filename: targetFilename,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to download session');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetFilename}.session`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess('Session file downloaded successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to download session');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDownloadAll = async () => {
    if (createdSessions.length === 0) {
      setError('No sessions to download');
      return;
    }

    setIsCreatingSession(true);
    setError(null);
    setSuccess(null);

    try {
      // Download all sessions one by one
      for (let i = 0; i < createdSessions.length; i++) {
        const session = createdSessions[i];
        
        const response = await fetch(`${API_BASE_URL}/api/download-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_path: session.sessionPath,
            filename: session.filename,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || `Failed to download session ${i + 1}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.filename}.session`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Small delay between downloads to avoid browser blocking
        if (i < createdSessions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      setSuccess(`All ${createdSessions.length} sessions downloaded successfully!`);
    } catch (err: any) {
      setError(err.message || 'Failed to download sessions');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCreateAnother = () => {
    // Reset form but keep created sessions
    setCurrentStep(1);
    setPhoneNumber('');
    setPhoneCodeHash('');
    setSessionPath('');
    setOtpCode('');
    setNeeds2FA(false);
    setPassword2FA('');
    setCustomFilename('');
    setUseRandomFilename(false);
    setError(null);
    setSuccess(null);
    setIsSendingOTP(false);
    setIsVerifyingOTP(false);
    setIsVerifying2FA(false);
  };

  const handleClearAll = () => {
    setCreatedSessions([]);
    handleCreateAnother();
    setSuccess('All sessions cleared');
  };

  const handleCreateAnotherSession = () => {
    handleCreateAnother();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Dashboard</span>
            </button>
            <PageHelpLink href="/docs" label="Guide & docs" />
          </div>
          
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Session Maker
            </h1>
            <p className="text-sm text-gray-400">
              Create a new Telegram session file with OTP + 2FA authentication
            </p>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      currentStep >= step
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-gray-500'
                    }`}
                  >
                    {currentStep > step ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <span className="text-sm font-medium">{step}</span>
                    )}
                  </div>
                  <div className={`mt-2 text-xs text-center ${
                    currentStep >= step ? 'text-white' : 'text-gray-500'
                  }`}>
                    {step === 1 && 'Phone'}
                    {step === 2 && 'OTP'}
                    {step === 3 && '2FA'}
                    {step === 4 && 'Save'}
                  </div>
                </div>
                {step < 4 && (
                  <div className={`flex-1 h-0.5 mx-2 ${
                    currentStep > step ? 'bg-white/30' : 'bg-white/10'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {currentStep === 1 && (
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white mb-2">
                Step 1: Enter Phone Number
              </h2>
              <p className="text-sm text-gray-400">
                Enter your phone number with country code (e.g., +1234567890)
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                  disabled={isSendingOTP}
                />
              </div>

              <button
                onClick={handleSendOTP}
                disabled={isSendingOTP || !phoneNumber.trim()}
                className="w-full px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSendingOTP ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending OTP...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send OTP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white mb-2">
                Step 2: Enter OTP Code
              </h2>
              <p className="text-sm text-gray-400">
                Check your Telegram app for the OTP code and enter it below
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  OTP Code
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="12345"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                  disabled={isVerifyingOTP}
                  maxLength={10}
                />
              </div>

              <div className="pt-4 border-t border-white/10">
                <label className="block text-sm text-gray-400 mb-3">
                  Session Filename (Optional)
                </label>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="random-filename"
                      checked={useRandomFilename}
                      onChange={(e) => setUseRandomFilename(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20"
                      disabled={isVerifyingOTP}
                    />
                    <label htmlFor="random-filename" className="text-sm text-gray-300 flex items-center gap-2">
                      <Shuffle className="w-4 h-4" />
                      Use random filename
                    </label>
                  </div>
                  {!useRandomFilename && (
                    <input
                      type="text"
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      placeholder="Leave empty to use phone number"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                      disabled={isVerifyingOTP}
                    />
                  )}
                </div>
              </div>

              <button
                onClick={handleVerifyOTP}
                disabled={isVerifyingOTP || !otpCode.trim()}
                className="w-full px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isVerifyingOTP ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying OTP...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    <span>Verify OTP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && needs2FA && (
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white mb-2">
                Step 3: Enter 2FA Password
              </h2>
              <p className="text-sm text-gray-400">
                Your account has 2FA enabled. Enter your password to continue.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  2FA Password
                </label>
                <input
                  type="password"
                  value={password2FA}
                  onChange={(e) => setPassword2FA(e.target.value)}
                  placeholder="Enter your 2FA password"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                  disabled={isVerifying2FA}
                />
              </div>

              <div className="pt-4 border-t border-white/10">
                <label className="block text-sm text-gray-400 mb-3">
                  Session Filename (Optional)
                </label>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="random-filename-2fa"
                      checked={useRandomFilename}
                      onChange={(e) => setUseRandomFilename(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20"
                      disabled={isVerifying2FA}
                    />
                    <label htmlFor="random-filename-2fa" className="text-sm text-gray-300 flex items-center gap-2">
                      <Shuffle className="w-4 h-4" />
                      Use random filename
                    </label>
                  </div>
                  {!useRandomFilename && (
                    <input
                      type="text"
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      placeholder="Leave empty to use phone number"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                      disabled={isVerifying2FA}
                    />
                  )}
                </div>
              </div>

              <button
                onClick={handleVerify2FA}
                disabled={isVerifying2FA || !password2FA.trim()}
                className="w-full px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isVerifying2FA ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying 2FA...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Verify 2FA</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Created Sessions List */}
        {createdSessions.length > 0 && (
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">
                Created Sessions ({createdSessions.length})
              </h2>
              <button
                onClick={handleDownloadAll}
                disabled={isCreatingSession}
                className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download All</span>
              </button>
            </div>
            
            <div className="space-y-3 mb-4">
              {createdSessions.map((session, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-white/5 border border-white/10 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-green-400 mb-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="font-medium text-sm">Session {idx + 1}</span>
                      </div>
                      <p className="text-sm text-gray-300">
                        Phone: <span className="text-white font-mono">{session.phoneNumber}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        File: <span className="font-mono">{session.filename}.session</span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadSession(session.sessionPath, session.filename)}
                      disabled={isCreatingSession}
                      className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-lg text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleClearAll}
              className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              <span>Clear All Sessions</span>
            </button>
          </div>
        )}

        {currentStep === 4 && (
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white mb-2">
                Step 4: Session Created
              </h2>
              <p className="text-sm text-gray-400">
                Your session has been created successfully! It's been added to your sessions list above. You can create another session or download all at once.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Session Added Successfully</span>
                </div>
                <p className="text-sm text-gray-300">
                  Latest session: <span className="font-mono text-white">{createdSessions[createdSessions.length - 1]?.filename}.session</span>
                </p>
              </div>

              <button
                onClick={handleCreateAnother}
                disabled={isCreatingSession}
                className="w-full px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Another Session</span>
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="mt-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="text-sm text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {success}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

