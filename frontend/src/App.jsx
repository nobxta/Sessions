import { Routes, Route } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import PageLayout from './components/PageLayout'
import ValidateSessions from './pages/ValidateSessions'
import ChangeName from './pages/ChangeName'
import ChangeUsername from './pages/ChangeUsername'
import ChangeBio from './pages/ChangeBio'
import ChangeProfilePicture from './pages/ChangeProfilePicture'
import JoinChatLists from './pages/JoinChatLists'
import LeaveAllGroups from './pages/LeaveAllGroups'
import SessionConverter from './pages/SessionConverter'
import CodeExtractor from './pages/CodeExtractor'
import TGDNAChecker from './pages/TGDNAChecker'
import SpamBotChecker from './pages/SpamBotChecker'
import SessionMaker from './pages/SessionMaker'
import SessionMetadataViewer from './pages/SessionMetadataViewer'
import PrivacySettings from './pages/PrivacySettings'
import './App.css'

function App() {
  return (
    <PageLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/validate-sessions" element={<ValidateSessions />} />
        <Route path="/change-name" element={<ChangeName />} />
        <Route path="/change-username" element={<ChangeUsername />} />
        <Route path="/change-bio" element={<ChangeBio />} />
        <Route path="/change-profile-picture" element={<ChangeProfilePicture />} />
        <Route path="/join-chatlists" element={<JoinChatLists />} />
        <Route path="/leave-all-groups" element={<LeaveAllGroups />} />
        <Route path="/session-converter" element={<SessionConverter />} />
        <Route path="/code-extractor" element={<CodeExtractor />} />
        <Route path="/tgdna-checker" element={<TGDNAChecker />} />
        <Route path="/spambot-checker" element={<SpamBotChecker />} />
        <Route path="/session-maker" element={<SessionMaker />} />
        <Route path="/session-metadata" element={<SessionMetadataViewer />} />
        <Route path="/privacy-settings" element={<PrivacySettings />} />
      </Routes>
    </PageLayout>
  )
}

export default App
