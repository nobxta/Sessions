'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  User,
  UserCircle,
  FileText,
  Image,
  FolderPlus,
  LogOut,
  Code,
  Key,
  Lock,
  Calendar,
  Shield,
  Info,
  Plus,
  Settings
} from 'lucide-react';
import DashboardCard from './DashboardCard';
import { API_BASE_URL } from '@/lib/config';

const Dashboard = () => {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const checkBackendConnection = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        setIsConnected(false);
      }
    };

    // Check immediately
    checkBackendConnection();

    // Check every 5 seconds
    const interval = setInterval(checkBackendConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  const dashboardOptions = [
    {
      id: 'session-maker',
      title: 'Session Maker',
      icon: Plus,
      onClick: () => router.push('/session-maker')
    },
    {
      id: 'validate-sessions',
      title: 'Validate Sessions',
      icon: ShieldCheck,
      onClick: () => router.push('/validate-sessions')
    },
    {
      id: 'change-name',
      title: 'Change Name',
      icon: User,
      onClick: () => router.push('/change-name')
    },
    {
      id: 'change-username',
      title: 'Change Username',
      icon: UserCircle,
      onClick: () => router.push('/change-username')
    },
    {
      id: 'change-bio',
      title: 'Change Bio',
      icon: FileText,
      onClick: () => router.push('/change-bio')
    },
    {
      id: 'change-profile-picture',
      title: 'Change Profile Picture',
      icon: Image,
      onClick: () => router.push('/change-profile-picture')
    },
    {
      id: 'privacy-settings',
      title: 'Privacy Settings',
      icon: Lock,
      onClick: () => router.push('/privacy-settings')
    },
    {
      id: 'join-folders',
      title: 'Join Folders',
      icon: FolderPlus,
      onClick: () => router.push('/join-chatlists')
    },
    {
      id: 'leave-all-groups',
      title: 'Leave All Groups',
      icon: LogOut,
      onClick: () => router.push('/leave-all-groups')
    },
    {
      id: 'change-session-string',
      title: 'Session Converter',
      icon: Code,
      onClick: () => router.push('/session-converter')
    },
    {
      id: 'code-extractor',
      title: 'Code Extractor',
      icon: Key,
      onClick: () => router.push('/code-extractor')
    },
    {
      id: 'tgdna-checker',
      title: 'Age Checker, Creation year',
      icon: Calendar,
      onClick: () => router.push('/tgdna-checker')
    },
    {
      id: 'spambot-checker',
      title: 'SpamBot Checker',
      icon: Shield,
      onClick: () => router.push('/spambot-checker')
    },
    {
      id: 'session-metadata',
      title: 'Session Metadata Viewer',
      icon: Info,
      onClick: () => router.push('/session-metadata')
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: Settings,
      onClick: () => router.push('/settings')
    }
  ];

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
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Compact header */}
        <header className={`mb-8 transition-all duration-700 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">
                Session Manager
              </h1>
              <p className="text-sm text-gray-400">
                Professional Telegram session management
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs text-gray-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </header>

        {/* Compact dashboard grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {dashboardOptions.map((option, index) => (
            <DashboardCard
              key={option.id}
              icon={option.icon}
              title={option.title}
              onClick={option.onClick}
              delay={index * 0.05}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

