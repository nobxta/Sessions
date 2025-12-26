'use client';

import { useState } from 'react';

const DashboardCard = ({ icon: Icon, title, onClick, delay = 0 }: { icon: any, title: string, onClick: () => void, delay?: number }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = () => {
    setIsLoading(true);
    // Call onClick immediately for navigation
    onClick?.();
    // Reset loading state after a short delay for visual feedback
    setTimeout(() => {
      setIsLoading(false);
    }, 200);
  };

  return (
    <div
      className="animate-slide-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="group relative w-full aspect-square bg-gradient-to-br from-white/[0.03] to-white/[0.01] hover:from-white/[0.06] hover:to-white/[0.03] border border-white/[0.1] hover:border-white/[0.2] rounded-2xl p-5 sm:p-6 transition-all duration-500 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-1 overflow-hidden backdrop-blur-sm"
      >
        {/* Animated gradient overlay */}
        <div
          className={`absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent transition-opacity duration-500 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Shimmer effect on hover */}
        <div
          className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full transition-transform duration-1000 ${
            isHovered ? 'translate-x-full' : ''
          }`}
        />

        {/* Corner accent */}
        <div
          className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-white/10 to-transparent rounded-bl-full transition-opacity duration-300 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 border-2 border-white/20 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-transparent border-t-white/80 rounded-full animate-spin"></div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="relative z-0 flex flex-col items-center justify-center gap-4 h-full">
          {/* Icon with enhanced styling */}
          <div
            className={`p-3 rounded-xl bg-white/[0.08] group-hover:bg-white/[0.12] transition-all duration-500 group-hover:shadow-lg group-hover:shadow-blue-500/20 ${
              isHovered ? 'scale-110 rotate-3' : 'scale-100'
            }`}
          >
            <Icon
              className={`w-7 h-7 sm:w-8 sm:h-8 transition-all duration-500 ${
                isHovered ? 'text-white scale-110' : 'text-gray-400'
              }`}
              strokeWidth={2.5}
            />
          </div>

          {/* Title with better typography */}
          <h3
            className={`text-xs sm:text-sm font-semibold text-center transition-all duration-300 leading-tight ${
              isHovered ? 'text-white scale-105' : 'text-gray-300'
            }`}
          >
            {title}
          </h3>
        </div>

        {/* Enhanced bottom accent */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent transition-opacity duration-500 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </button>
    </div>
  );
};

export default DashboardCard;

