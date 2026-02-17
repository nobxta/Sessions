'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, FolderPlus, FolderMinus, Play, AlertCircle, Trash2 } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import PageHelpLink from '@/components/PageHelpLink';
import { API_BASE_URL, WS_BASE_URL } from '@/lib/config';

export default function JoinChatLists() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [extractedSessions, setExtractedSessions] = useState<any[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [selectedFoldersToLeave, setSelectedFoldersToLeave] = useState<Record<number, number[]>>({});
  const [inviteLinks, setInviteLinks] = useState<string[]>(['']);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResults, setProcessResults] = useState<any[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleFileSelect = async (selectedFiles: File[] | File | null) => {
    const fileArray = selectedFiles ? (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]) : [];
    
    if (fileArray.length === 0) {
      setFiles([]);
      setExtractedSessions([]);
      setScanResults([]);
      setProcessResults([]);
      setError(null);
      return;
    }

    setFiles(fileArray);
    setScanResults([]);
    setProcessResults([]);
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

  const handleScan = async () => {
    if (extractedSessions.length === 0) return;

    setIsScanning(true);
    setError(null);
    setScanResults([]);
    setSelectedFoldersToLeave({});

    try {
      const tempDirs = (Array.isArray(extractionData) ? extractionData : [extractionData]).flatMap((data: any) => data.temp_dirs || []);
      
      const response = await fetch(`${API_BASE_URL}/api/scan-chatlists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessions: extractedSessions,
          temp_dirs: tempDirs,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to scan chat lists';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setScanResults(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to scan chat lists');
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleFolder = (sessionIndex: number, folderId: number) => {
    setSelectedFoldersToLeave(prev => {
      const sessionFolders = prev[sessionIndex] || [];
      const isSelected = sessionFolders.includes(folderId);
      
      return {
        ...prev,
        [sessionIndex]: isSelected
          ? sessionFolders.filter(id => id !== folderId)
          : [...sessionFolders, folderId]
      };
    });
  };

  const handleLeaveAll = (sessionIndex: number) => {
    const sessionResult = scanResults[sessionIndex];
    if (!sessionResult || !sessionResult.success) return;
    
    const allFolderIds = (sessionResult.folders || []).map((f: any) => f.id);
    setSelectedFoldersToLeave(prev => ({
      ...prev,
      [sessionIndex]: allFolderIds
    }));
  };

  const handleClearSelection = (sessionIndex: number) => {
    setSelectedFoldersToLeave(prev => {
      const newState = { ...prev };
      delete newState[sessionIndex];
      return newState;
    });
  };

  const handleLeaveSelected = async () => {
    const hasSelectedFolders = Object.values(selectedFoldersToLeave).some(folders => folders && folders.length > 0);
    if (!hasSelectedFolders) {
      setError('No folders selected to leave');
      return;
    }

    if (extractedSessions.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setProcessResults([]);
    setProgress({ current: 0, total: extractedSessions.length, message: 'Starting leave operations...' });

    const sessionsWithPremium = extractedSessions.map((session, idx) => {
      const scanResult = scanResults[idx];
      return {
        ...session,
        is_premium: scanResult?.is_premium || false
      };
    });

    const ws = new WebSocket(`${WS_BASE_URL}/ws/join-chatlists`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        sessions: sessionsWithPremium,
        leave_config: selectedFoldersToLeave,
        invite_links: [],
        temp_dirs: (Array.isArray(extractionData) ? extractionData : [extractionData]).flatMap((data: any) => data.temp_dirs || [])
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'start':
          setProgress({
            current: 0,
            total: message.total,
            message: message.message
          });
          setProcessResults(new Array(message.total).fill(null));
          break;

        case 'leave_progress':
        case 'join_progress':
          setProgress(prev => ({
            ...prev,
            message: message.message
          }));
          break;

        case 'session_complete':
          setProcessResults(prev => {
            const newResults = [...prev];
            newResults[message.index] = message.result;
            return newResults;
          });
          setProgress(prev => ({
            ...prev,
            current: prev.current + 1
          }));
          break;

        case 'complete':
          setIsProcessing(false);
          setProgress(prev => ({
            ...prev,
            message: message.message
          }));
          if (scanResults.length > 0) {
            handleScan();
          }
          break;

        case 'error':
          setError(message.message);
          setIsProcessing(false);
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsProcessing(false);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  };

  const handleLeaveAllFromAllSessions = () => {
    const allSelected: Record<number, number[]> = {};
    scanResults.forEach((result, sessionIdx) => {
      if (result.success && result.folders && result.folders.length > 0) {
        allSelected[sessionIdx] = result.folders.map((f: any) => f.id);
      }
    });
    setSelectedFoldersToLeave(allSelected);
  };

  const handleInviteLinkChange = (index: number, value: string) => {
    const newLinks = [...inviteLinks];
    newLinks[index] = value;
    setInviteLinks(newLinks);
  };

  const handleAddInviteLink = () => {
    if (inviteLinks.length < 5) {
      setInviteLinks([...inviteLinks, '']);
    }
  };

  const handleRemoveInviteLink = (index: number) => {
    if (inviteLinks.length > 1) {
      const newLinks = inviteLinks.filter((_, i) => i !== index);
      setInviteLinks(newLinks);
    }
  };

  const handleStart = () => {
    if (extractedSessions.length === 0) {
      setError('Please upload sessions first');
      return;
    }
    
    const hasFoldersToLeave = Object.values(selectedFoldersToLeave).some(
      folders => folders && folders.length > 0
    );
    
    const validLinks = inviteLinks
      .map(link => link.trim())
      .filter(link => link !== '' && link !== 't.me/addlist/XXXXX');
    
    if (validLinks.length === 0 && !hasFoldersToLeave) {
      setError('Please either select folders to leave or provide at least one chat list invite link');
      return;
    }

    if (validLinks.length > 5) {
      setError('Maximum 5 invite links allowed');
      return;
    }
    
    if (validLinks.length > 0) {
      const invalidLinks = validLinks.filter(link => {
        const pattern = /^(https?:\/\/)?(www\.)?t\.me\/addlist\/[a-zA-Z0-9_-]+$/i;
        return !pattern.test(link);
      });
      
      if (invalidLinks.length > 0) {
        setError(`Invalid invite link format. Please use: t.me/addlist/XXXXX`);
        return;
      }
    }

    setIsProcessing(true);
    setError(null);
    setProcessResults([]);
    setProgress({ current: 0, total: extractedSessions.length, message: 'Starting operations...' });

    const leaveConfig: Record<number, number[]> = {};
    Object.keys(selectedFoldersToLeave).forEach(sessionIdx => {
      const folderIds = selectedFoldersToLeave[parseInt(sessionIdx)];
      if (folderIds && folderIds.length > 0) {
        leaveConfig[parseInt(sessionIdx)] = folderIds;
      }
    });

    const sessionsWithPremium = extractedSessions.map((session, idx) => {
      const scanResult = scanResults[idx];
      return {
        ...session,
        is_premium: scanResult?.is_premium || false
      };
    });

    const ws = new WebSocket(`${WS_BASE_URL}/ws/join-chatlists`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        sessions: sessionsWithPremium,
        leave_config: leaveConfig,
        invite_links: validLinks,
        temp_dirs: (Array.isArray(extractionData) ? extractionData : [extractionData]).flatMap((data: any) => data.temp_dirs || [])
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'start':
          setProgress({
            current: 0,
            total: message.total,
            message: message.message
          });
          setProcessResults(new Array(message.total).fill(null));
          break;

        case 'leave_progress':
        case 'join_progress':
          setProgress(prev => ({
            ...prev,
            message: message.message
          }));
          break;

        case 'session_complete':
          setProcessResults(prev => {
            const newResults = [...prev];
            newResults[message.index] = message.result;
            return newResults;
          });
          setProgress(prev => ({
            ...prev,
            current: prev.current + 1
          }));
          break;

        case 'complete':
          setIsProcessing(false);
          setProgress(prev => ({
            ...prev,
            message: message.message
          }));
          break;

        case 'error':
          setError(message.message);
          setIsProcessing(false);
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsProcessing(false);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'success':
        return { icon: CheckCircle2, color: 'text-green-400', label: 'Success' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-400', label: 'Failed' };
      case 'skipped':
        return { icon: AlertCircle, color: 'text-yellow-400', label: 'Skipped' };
      case 'partial':
        return { icon: AlertCircle, color: 'text-yellow-400', label: 'Partial' };
      default:
        return { icon: Loader2, color: 'text-gray-400', label: 'Processing' };
    }
  };

  const completedCount = processResults.filter(r => r !== null).length;
  const successCount = processResults.filter(r => r?.status === 'success').length;
  const failureCount = processResults.filter(r => r?.status === 'failed').length;
  const skippedCount = processResults.filter(r => r?.status === 'skipped').length;

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
            <PageHelpLink href="/docs/tgdna-group-manager" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Join Chat Lists / Folders</h1>
          <p className="text-gray-400">Upload sessions, scan existing folders, and join new chat lists</p>
        </div>

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
              {skippedCount > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="text-2xl font-bold text-white">{skippedCount}</div>
                    <div className="text-xs text-gray-400">Skipped</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{extractedSessions.length}</div>
                  <div className="text-xs text-gray-400">Total</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-8">
          <FileUpload onFileSelect={handleFileSelect} multiple={true} />
          {isExtracting && (
            <div className="mt-4 flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting sessions...</span>
            </div>
          )}
        </div>

        {extractedSessions.length > 0 && !isScanning && scanResults.length === 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Sessions ({extractedSessions.length})
              </h2>
              <button
                onClick={handleScan}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Scan Folders</span>
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

        {isScanning && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Scanning folders for all sessions...</span>
            </div>
          </div>
        )}

        {scanResults.length > 0 && !isProcessing && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Existing Folders</h2>
              {scanResults.some(r => r.success && r.folders && r.folders.length > 0) && (
                <div className="flex gap-2">
                  <button
                    onClick={handleLeaveAllFromAllSessions}
                    className="px-4 py-2 text-sm bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-colors flex items-center gap-2"
                  >
                    <FolderMinus className="w-4 h-4" />
                    <span>Leave All from All Sessions</span>
                  </button>
                  <button
                    onClick={handleLeaveSelected}
                    disabled={!Object.values(selectedFoldersToLeave).some(folders => folders && folders.length > 0)}
                    className={`px-4 py-2 text-sm border rounded-lg transition-colors flex items-center gap-2 ${
                      Object.values(selectedFoldersToLeave).some(folders => folders && folders.length > 0)
                        ? 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/30 text-orange-400 cursor-pointer'
                        : 'bg-gray-500/10 border-gray-500/20 text-gray-500 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <FolderMinus className="w-4 h-4" />
                    <span>Leave Selected</span>
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {scanResults.map((result, sessionIdx) => (
                <div key={sessionIdx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-white font-medium">
                        {extractedSessions[sessionIdx]?.name || `Session ${sessionIdx + 1}`}
                      </h3>
                      {result.is_premium && (
                        <span className="text-xs text-yellow-400">Premium Account</span>
                      )}
                    </div>
                    {result.success && result.folders && result.folders.length > 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLeaveAll(sessionIdx)}
                          className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-400 transition-colors"
                        >
                          Leave All
                        </button>
                        <button
                          onClick={() => handleClearSelection(sessionIdx)}
                          className="px-3 py-1 text-xs bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 rounded text-gray-400 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {!result.success ? (
                    <div className="text-sm text-red-400">
                      {result.error || 'Failed to scan folders'}
                    </div>
                  ) : result.folders && result.folders.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {result.folders.map((folder: any) => {
                        const isSelected = (selectedFoldersToLeave[sessionIdx] || []).includes(folder.id);
                        return (
                          <label
                            key={folder.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-500/20 border-blue-500/50'
                                : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.03]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleFolder(sessionIdx, folder.id)}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-white">{folder.name}</div>
                                <div className="text-xs text-gray-400">ID: {folder.id}</div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">No existing folders found</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {scanResults.length > 0 && !isProcessing && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Chat List Invite Links</h2>
            <div className="space-y-3">
              {inviteLinks.map((link, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={link}
                    onChange={(e) => handleInviteLinkChange(idx, e.target.value)}
                    placeholder="t.me/addlist/XXXXX"
                    className="flex-1 px-4 py-2.5 bg-white/[0.02] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition-colors"
                  />
                  {inviteLinks.length > 1 && (
                    <button
                      onClick={() => handleRemoveInviteLink(idx)}
                      className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {inviteLinks.length < 5 && (
                <button
                  onClick={handleAddInviteLink}
                  className="w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm transition-colors"
                >
                  + Add Another Link
                </button>
              )}
              <p className="text-xs text-gray-400 mt-2">
                Enter 1-5 chat list invite links (t.me/addlist/XXXXX format)
              </p>
            </div>
          </div>
        )}

        {scanResults.length > 0 && !isProcessing && (
          <div className="mb-8">
            <button
              onClick={handleStart}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
            >
              <FolderPlus className="w-5 h-5" />
              <span>Start Joining Chat Lists</span>
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">
                {progress.message}
              </span>
              <span className="text-xs text-gray-400">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {processResults.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
            <div className="space-y-3">
              {processResults.map((result, idx) => {
                if (result === null) {
                  return (
                    <div key={idx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    </div>
                  );
                }

                const statusConfig = getStatusConfig(result.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <div key={idx} className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
                    <div className="flex items-center justify-between mb-3">
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

                    <div className="space-y-1 text-sm">
                      {result.folders_left > 0 && (
                        <div className="text-gray-300">
                          Left {result.folders_left} folder(s)
                        </div>
                      )}
                      {result.folders_joined > 0 && (
                        <div className="text-green-400">
                          Joined {result.folders_joined} chat list(s)
                        </div>
                      )}
                      {result.errors && result.errors.length > 0 && (
                        <div className="text-red-400">
                          {result.errors.map((err: string, errIdx: number) => (
                            <div key={errIdx}>{err}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

