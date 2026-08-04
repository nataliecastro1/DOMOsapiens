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
  const [authChecked, setAuthChecked]   = useState(false);
  const [activeView, setActiveView]     = useState('extract');
  const [theme, setTheme]               = useState(() => localStorage.getItem('theme') || 'light');

  // Silent sign-in: Alfred SSO headers when deployed, auto dev user locally.
  // The form login only appears if /api/auth/me says unauthenticated.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(me => {
        if (me.authenticated) {
          setLoggedIn(true);
          setLoggedInUser(me.username);
          if (shouldShowTutorial()) setShowTutorial(true);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [loginClient, setLoginClient]   = useState('');
  const [loginPublisher, setLoginPublisher] = useState('');
  const [clients, setClients]           = useState(null);
  const [clientHandles, setClientHandles] = useState(null);
  const [extractionKey, setExtractionKey] = useState(0);
  // A filtered subset of records handed off from the Tracker → Dashboards.
  // Null when the user opens Dashboards normally (works off the full dataset).
  const [dashboardSeed, setDashboardSeed] = useState(null);
  const [dashboardTarget, setDashboardTarget] = useState(null); // record to open directly
  const [newDashId, setNewDashId] = useState(null); // newly saved auto-dashboard to highlight
  const meta = VIEW_META[activeView] || VIEW_META.extract;

  // Jump to Dashboards scoped to exactly the rows currently shown in the Tracker.
  const sendToDashboards = (records) => {
    setDashboardSeed(Array.isArray(records) ? records : null);
    setActiveView('dashboards');
  };

  const handleLogin = (username, client = '', publisher = '') => {
    setLoggedIn(true);
    setLoggedInUser(username);
    setLoginClient(client);
    setLoginPublisher(publisher);
    if (shouldShowTutorial()) setShowTutorial(true);
  };

  if (!authChecked) {
    return null; // avoid flashing the login form while /api/auth/me resolves
  }

  if (!loggedIn) {
    return <LoginView onLogin={handleLogin} />;
  }

  const renderView = () => {
    switch (activeView) {
      case 'extract':    return <ExtractionView key={extractionKey} onNav={(view, dashId) => { if (dashId) setNewDashId(dashId); setActiveView(view); }} clients={clients} clientHandles={clientHandles} loggedInUser={loggedInUser} initialClient={loginClient} initialPublisher={loginPublisher} onOpenRecord={r => { setDashboardTarget(r); setActiveView('dashboards'); }} />;
      case 'dashboards': return <DashboardsView seed={dashboardSeed} onSeedConsumed={() => setDashboardSeed(null)} loginClient={loginClient} loginPublisher={loginPublisher} targetRecord={dashboardTarget} onTargetConsumed={() => setDashboardTarget(null)} loggedInUser={loggedInUser} newDashId={newDashId} onNewDashConsumed={() => setNewDashId(null)} />;
      case 'tracker':    return <TrackerView loggedInUser={loggedInUser} onSendToDashboards={sendToDashboards} />;
      case 'clients':    return <ClientsView />;
      case 'help':       return <HelpView />;
      case 'settings':   return <SettingsView theme={theme} onThemeChange={setTheme} />;
      default:           return <ExtractionView onNav={setActiveView} clients={clients} clientHandles={clientHandles} loggedInUser={loggedInUser} initialClient={loginClient} initialPublisher={loginPublisher} />;
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
          </div>
          <div className="content">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}
