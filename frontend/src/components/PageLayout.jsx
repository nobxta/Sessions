import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu, X } from 'lucide-react';

const PageLayout = ({ children }) => {
  const location = useLocation();
  const showSidebar = location.pathname !== '/';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {showSidebar && (
        <>
          {/* Mobile menu button */}
          <button
            onClick={toggleMobileMenu}
            className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 text-white hover:bg-blue-500/30 transition-all duration-300 shadow-lg"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>

          {/* Backdrop overlay for mobile */}
          {isMobileMenuOpen && (
            <div
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={closeMobileMenu}
            />
          )}

          {/* Sidebar */}
          <Sidebar 
            isMobileOpen={isMobileMenuOpen}
            onClose={closeMobileMenu}
          />
        </>
      )}
      <div className={showSidebar ? 'lg:ml-64' : ''}>
        {children}
      </div>
    </div>
  );
};

export default PageLayout;

