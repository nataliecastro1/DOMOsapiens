import React, { useState, useEffect } from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import ExtractionView from './views/ExtractionView';
import DashboardsView from './views/DashboardsView';
import TrackerView from './views/TrackerView';
import ClientsView from './views/ClientsView';
import HelpView from './views/HelpView';
import LoginView from './views/LoginView';
import SettingsView from './views/SettingsView';
import TutorialOverlay, { shouldShowTutorial } from './components/TutorialOverlay';
import ClientFolderGate from './components/ClientFolderGate';
import './index.css';

const VIEW_META = {
  extract:    { title: 'ROI Report Extraction', sub: 'Extract, validate, and store client ROI data',                              ctx: '/ ROI Extraction' },
  dashboards: { title: 'Dashboards',             sub: 'Build and save custom ROI views',                                           ctx: '/ Dashboards'     },
  tracker:    { title: 'ROI Tracker',            sub: 'Client_ROI_Tracker.xlsx — All_ROI_Data · SME_Audit_Log · Source_File_Log', ctx: '/ ROI Tracker'    },
  clients:    { title: 'Clients',                sub: 'Manage active client accounts',                                             ctx: '/ Clients'        },
  help:       { title: 'Help & Docs',            sub: 'Quick reference and documentation',                                         ctx: '/ Help'           },
  settings:   { title: 'Settings',               sub: 'Appearance and account preferences',                                        ctx: '/ Settings'       },
};

export default function App() {
  const [loggedIn, setLoggedIn]         = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [activeView, setActiveView]     = useState('extract');
  const [theme, setTheme]               = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showClientGate, setShowClientGate] = useState(false);
  const [clients, setClients]           = useState(null);
  const [clientHandles, setClientHandles] = useState(null);
  const [extractionKey, setExtractionKey] = useState(0);
  // A filtered subset of records handed off from the Tracker → Dashboards.
  // Null when the user opens Dashboards normally (works off the full dataset).
  const [dashboardSeed, setDashboardSeed] = useState(null);
  const meta = VIEW_META[activeView] || VIEW_META.extract;

  // Jump to Dashboards scoped to exactly the rows currently shown in the Tracker.
  const sendToDashboards = (records) => {
    setDashboardSeed(Array.isArray(records) ? records : null);
    setActiveView('dashboards');
  };

  const handleLogin = (username) => {
    setLoggedIn(true);
    setLoggedInUser(username);
    setShowClientGate(true);   // ask to load the client list before the app loads
  };

  // Called when the client-folder gate finishes — either with a loaded list or
  // a skip (result === null). Tutorial follows once the gate is dismissed.
  const finishClientGate = (result) => {
    if (result && result.clients && result.clients.length) {
      setClients(result.clients);
      setClientHandles(result.handles);
    }
    setShowClientGate(false);
    if (shouldShowTutorial()) setShowTutorial(true);
  };

  if (!loggedIn) {
    return <LoginView onLogin={handleLogin} />;
  }

  if (showClientGate) {
    return (
      <ClientFolderGate
        onLoaded={finishClientGate}
        onSkip={() => finishClientGate(null)}
      />
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'extract':    return <ExtractionView key={extractionKey} onNav={setActiveView} clients={clients} clientHandles={clientHandles} loggedInUser={loggedInUser} />;
      case 'dashboards': return <DashboardsView seed={dashboardSeed} onSeedConsumed={() => setDashboardSeed(null)} />;
      case 'tracker':    return <TrackerView loggedInUser={loggedInUser} onSendToDashboards={sendToDashboards} />;
      case 'clients':    return <ClientsView />;
      case 'help':       return <HelpView />;
      case 'settings':   return <SettingsView theme={theme} onThemeChange={setTheme} />;
      default:           return <ExtractionView onNav={setActiveView} clients={clients} clientHandles={clientHandles} loggedInUser={loggedInUser} />;
    }
  };

  return (
    <div className="app">
      {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}
      <TopBar ctxLabel={meta.ctx} onLogout={() => setLoggedIn(false)} />
      <div className="app-body">
        <Sidebar activeView={activeView} onNav={setActiveView} />
        <main className="main">
          <div className="topstrip">
            <div>
              <div className="page-title">{meta.title}</div>
              <div className="page-sub">{meta.sub}</div>
            </div>
            {activeView === 'extract' && (
              <button className="btn primary" onClick={() => setExtractionKey(k => k + 1)}>
                <i className="ti ti-plus" aria-hidden="true" /> New Extraction
              </button>
            )}
          </div>
          <div className="content">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}
