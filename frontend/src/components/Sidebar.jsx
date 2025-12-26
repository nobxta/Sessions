import { useNavigate, useLocation } from 'react-router-dom';
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
  Calendar,
  Shield,
  Plus,
  Info,
  LayoutGrid,
  Sparkles,
  Lock
} from 'lucide-react';

const Sidebar = ({ isMobileOpen = false, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navGroups = [
    {
      id: 'main',
      items: [
        {
          id: 'dashboard',
          title: 'Dashboard',
          icon: LayoutGrid,
          path: '/'
        }
      ]
    },
    {
      id: 'session',
      label: 'Session Tools',
      items: [
        {
          id: 'session-maker',
          title: 'Session Maker',
          icon: Plus,
          path: '/session-maker'
        },
        {
          id: 'validate-sessions',
          title: 'Validate Sessions',
          icon: ShieldCheck,
          path: '/validate-sessions'
        },
        {
          id: 'session-converter',
          title: 'Session Converter',
          icon: Code,
          path: '/session-converter'
        },
        {
          id: 'code-extractor',
          title: 'Code Extractor',
          icon: Key,
          path: '/code-extractor'
        },
        {
          id: 'session-metadata',
          title: 'Session Metadata',
          icon: Info,
          path: '/session-metadata'
        }
      ]
    },
    {
      id: 'profile',
      label: 'Profile Management',
      items: [
        {
          id: 'change-name',
          title: 'Change Name',
          icon: User,
          path: '/change-name'
        },
        {
          id: 'change-username',
          title: 'Change Username',
          icon: UserCircle,
          path: '/change-username'
        },
        {
          id: 'change-bio',
          title: 'Change Bio',
          icon: FileText,
          path: '/change-bio'
        },
        {
          id: 'change-profile-picture',
          title: 'Change Picture',
          icon: Image,
          path: '/change-profile-picture'
        },
        {
          id: 'privacy-settings',
          title: 'Privacy Settings',
          icon: Lock,
          path: '/privacy-settings'
        }
      ]
    },
    {
      id: 'utilities',
      label: 'Utilities',
      items: [
        {
          id: 'join-folders',
          title: 'Join Folders',
          icon: FolderPlus,
          path: '/join-chatlists'
        },
        {
          id: 'leave-all-groups',
          title: 'Leave All Groups',
          icon: LogOut,
          path: '/leave-all-groups'
        },
        {
          id: 'tgdna-checker',
          title: 'Age Checker',
          icon: Calendar,
          path: '/tgdna-checker'
        },
        {
          id: 'spambot-checker',
          title: 'SpamBot Checker',
          icon: Shield,
          path: '/spambot-checker'
        }
      ]
    }
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname === path;
  };

  const handleNavigation = (path) => {
    navigate(path);
    // Close mobile menu after navigation
    if (onClose) {
      onClose();
    }
  };

  return (
    <aside className={`fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-[#0f0f15] to-[#0a0a0f] border-r border-white/5 z-40 overflow-y-auto backdrop-blur-xl transition-transform duration-300 ease-in-out
      ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      {/* Custom scrollbar styling */}
      <style>{`
        aside::-webkit-scrollbar {
          width: 6px;
        }
        aside::-webkit-scrollbar-track {
          background: transparent;
        }
        aside::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        aside::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

      <div className="p-5">
        {/* Enhanced Header */}
        <div className="mb-8 pt-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-lg"></div>
              <div className="relative bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-2.5 rounded-lg border border-blue-500/20">
                <Sparkles className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Session Manager</h2>
              <p className="text-xs text-gray-400/80">Professional Tools</p>
            </div>
          </div>
        </div>
        
        {/* Navigation Groups */}
        <nav className="space-y-6">
          {navGroups.map((group) => (
            <div key={group.id}>
              {group.label && (
                <div className="px-3 mb-2">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((option) => {
                  const Icon = option.icon;
                  const active = isActive(option.path);
                  
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleNavigation(option.path)}
                      className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 text-left ${
                        active
                          ? 'text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {/* Active indicator bar */}
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-blue-400 to-purple-400 rounded-r-full shadow-lg shadow-blue-500/50"></div>
                      )}
                      
                      {/* Background gradient on active/hover */}
                      <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${
                        active
                          ? 'bg-gradient-to-r from-blue-500/20 via-blue-500/10 to-transparent border border-blue-500/20 shadow-lg shadow-blue-500/10'
                          : 'bg-white/0 group-hover:bg-white/5 border border-transparent group-hover:border-white/10'
                      }`}></div>
                      
                      {/* Icon with glow effect */}
                      <div className={`relative z-10 transition-all duration-300 ${
                        active 
                          ? 'scale-110' 
                          : 'group-hover:scale-110'
                      }`}>
                        <Icon className={`w-5 h-5 flex-shrink-0 transition-colors duration-300 ${
                          active 
                            ? 'text-blue-400 drop-shadow-lg' 
                            : 'text-gray-400 group-hover:text-blue-400/80'
                        }`} />
                      </div>
                      
                      {/* Text */}
                      <span className={`relative z-10 text-sm font-medium transition-all duration-300 ${
                        active ? 'font-semibold' : ''
                      }`}>
                        {option.title}
                      </span>
                      
                      {/* Subtle shine effect on hover */}
                      {!active && (
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:translate-x-full transition-all duration-700"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom gradient fade */}
        <div className="sticky bottom-0 h-20 bg-gradient-to-t from-[#0f0f15] to-transparent pointer-events-none -mb-5"></div>
      </div>
    </aside>
  );
};

export default Sidebar;

