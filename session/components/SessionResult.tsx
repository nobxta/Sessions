'use client';

import { CheckCircle2, XCircle, AlertCircle, User, Phone, AtSign } from 'lucide-react';

const SessionResult = ({ result, sessionName }: { result: any, sessionName?: string }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return {
          color: 'bg-green-500/20 text-green-400 border-green-500/30',
          icon: CheckCircle2,
          label: 'ACTIVE'
        };
      case 'FROZEN':
        return {
          color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
          icon: AlertCircle,
          label: 'FROZEN'
        };
      case 'UNAUTHORIZED':
        return {
          color: 'bg-red-500/20 text-red-400 border-red-500/30',
          icon: XCircle,
          label: 'UNAUTHORIZED'
        };
      default:
        return {
          color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
          icon: AlertCircle,
          label: 'UNKNOWN'
        };
    }
  };

  const statusConfig = getStatusConfig(result.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="border border-white/10 rounded-xl p-5 bg-white/[0.02] hover:bg-white/[0.03] transition-colors">
      {/* Header with status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-lg border ${statusConfig.color} flex items-center gap-1.5`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">{statusConfig.label}</span>
          </div>
          {sessionName && (
            <span className="text-xs text-gray-500 font-mono">{sessionName}</span>
          )}
        </div>
      </div>

      {/* User Info */}
      {result.logged_in && result.first_name && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-gray-500" />
            <span className="text-white">
              {result.first_name} {result.last_name || ''}
            </span>
          </div>
          {result.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-gray-500" />
              <span className="text-gray-300">{result.phone}</span>
            </div>
          )}
          {result.username && (
            <div className="flex items-center gap-2 text-sm">
              <AtSign className="w-4 h-4 text-gray-500" />
              <span className="text-gray-300">@{result.username}</span>
            </div>
          )}
        </div>
      )}

      {/* Capabilities */}
      <div className="flex items-center gap-4 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          {result.logged_in ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-gray-600" />
          )}
          <span className="text-xs text-gray-400">Logged In</span>
        </div>
        <div className="flex items-center gap-1.5">
          {result.can_read === true ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-gray-600" />
          )}
          <span className="text-xs text-gray-400">Read</span>
        </div>
        <div className="flex items-center gap-1.5">
          {result.can_send === true ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-gray-600" />
          )}
          <span className="text-xs text-gray-400">Send</span>
        </div>
      </div>
    </div>
  );
};

export default SessionResult;

