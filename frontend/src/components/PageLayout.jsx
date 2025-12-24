import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const PageLayout = ({ children }) => {
  const location = useLocation();
  const showSidebar = location.pathname !== '/';

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {showSidebar && <Sidebar />}
      <div className={showSidebar ? 'ml-64' : ''}>
        {children}
      </div>
    </div>
  );
};

export default PageLayout;

