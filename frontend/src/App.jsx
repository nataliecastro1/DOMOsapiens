import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';

// Code splitting: dynamically import heavy views so the initial bundle stays small
const ExtractionView = lazy(() => import('./views/ExtractionView'));
const QueueView      = lazy(() => import('./views/QueueView'));
const DashboardsView = lazy(() => import('./views/DashboardsView'));
const ClientsView    = lazy(() => import('./views/ClientsView'));
const HelpView       = lazy(() => import('./views/HelpView'));
const LoginView      = lazy(() => import('./views/LoginView'));
const SettingsView   = lazy(() => import('./views/SettingsView'));
import TutorialOverlay, { shouldShowTutorial } from './components/TutorialOverlay';
import AccessGuard from './components/AccessGuard';
import { BASE } from './services/api';
import { getRoiAccess } from './services/hub';
import { getHubContext } from './services/hubContext';
import { hydrate as hydrateDashboards } from './services/dashboards';
import './index.css';

const VIEW_META = {
  extract:    { title: 'ROI Report Extraction', sub: 'Extract, validate, and store client ROI data',                              ctx: '/ ROI Extraction' },
  queue:      { title: 'Extraction Queue',      sub: 'Monitor background extraction jobs',                                        ctx: '/ Queue'          },
  dashboards: { title: 'Dashboards',            sub: 'Build and save custom ROI views',                                           ctx: '/ Dashboards'     },

  clients:    { title: 'Clients',               sub: 'Manage active client accounts',                                             ctx: '/ Clients'        },
  help:       { title: 'Help & Docs',           sub: 'Quick reference and documentation',                                         ctx: '/ Help'           },
  settings:   { title: 'Settings',              sub: 'Appearance and account preferences',                                        ctx: '/ Settings'       },
};

export default function App() {
  const [loggedIn, setLoggedIn]         = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [authChecked, setAuthChecked]   = useState(false);
  // ROI capabilities per the hub's RBAC. null = still resolving or hub
  // unreachable (fail open, since the hub enforces the real gate server-side).
  const [roiAccess, setRoiAccess]       = useState(null);
  const location                        = useLocation();
  const navigate                        = useNavigate();
  const activePath                      = location.pathname.split('/')[1] || 'extract';
  const [theme, setTheme]               = useState(() => localStorage.getItem('theme') || 'light');

  // Silent sign-in: Alfred SSO headers when deployed, auto dev user locally.
  // The sign-in notice only appears if /api/auth/me says unauthenticated.
  useEffect(() => {
    // Capture the hub handoff (?deliverable_id=…&workstream=…) before anything
    // else can touch the URL, so it can't be lost before the first save.
    getHubContext();
    const signIn = fetch(`${BASE}/auth/me`)
      .then(r => r.json())
      .then(me => {
        if (me.authenticated) {
          setLoggedIn(true);
          setLoggedInUser(me.username);
          if (shouldShowTutorial()) setShowTutorial(true);
        }
      })
      .catch(() => {});
    // Dashboards are read synchronously by the views, so the cache has to be
    // warm before the first render — and this is where any dashboards still
    // stranded in localStorage get adopted by the server.
    const dashboards = hydrateDashboards().catch(() => {});
    Promise.all([signIn, dashboards]).finally(() => setAuthChecked(true));
    getRoiAccess().then(setRoiAccess);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [loginClient, setLoginClient]   = useState('');
  const [loginPublisher, setLoginPublisher] = useState('');
  const [extractionKey, setExtractionKey] = useState(0);
  // A filtered subset of records handed off from the Tracker → Dashboards.
  // Null when the user opens Dashboards normally (works off the full dataset).
  const [dashboardSeed, setDashboardSeed] = useState(null);
  const [dashboardTarget, setDashboardTarget] = useState(null); // record to open directly
  const [newDashId, setNewDashId] = useState(null); // newly saved auto-dashboard to highlight
  const meta = VIEW_META[activePath] || VIEW_META.extract;

  // Jump to Dashboards scoped to exactly the rows currently shown in the Tracker.
  const sendToDashboards = (records) => {
    setDashboardSeed(Array.isArray(records) ? records : null);
    navigate('/dashboards');
  };

  if (!authChecked) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="ti ti-loader-2 spinning" style={{ fontSize: 40, color: 'var(--blue)', marginBottom: 16 }} />
          <div>Starting ROI Workspace...</div>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <Suspense fallback={null}>
        <LoginView onDevLogin={() => {
          // Set mock Hub Context for local DEV testing
          localStorage.setItem('hub_deliverable_id', 'dev-deliv-1234');
          localStorage.setItem('hub_workstream_name', 'Dev Workstream');
          localStorage.setItem('hub_client_name', 'Anglepoint Demo');
          localStorage.setItem('hub_applicable_from', '2023-01-01');
          localStorage.setItem('hub_applicable_to', '2024-12-31');
          setLoggedIn(true);
          setLoggedInUser('dev_user');
        }} />
      </Suspense>
    );
  }

  return (
    <div className="app">
      <TopBar ctxLabel={meta.ctx} onLogout={() => setLoggedIn(false)} />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <div className="topstrip">
            <div>
              <div className="page-title">{meta.title}</div>
              <div className="page-sub">{meta.sub}</div>
            </div>
          </div>
          <div className="content">
            <Suspense fallback={
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <i className="ti ti-loader-2 spinning" style={{ fontSize: 24, marginRight: 8 }} /> Loading view...
              </div>
            }>
              <Routes>
                <Route path="/" element={<Navigate to="/extract" replace />} />
                
                <Route path="/extract" element={
                  (roiAccess && roiAccess.can_extract === false) ? 
                    <AccessGuard role={roiAccess.role} allowedRoles={roiAccess.allowed_roles} user={roiAccess.user || loggedInUser} /> :
                    <ExtractionView 
                      key={extractionKey} 
                      onNav={(view, dashId) => { if (dashId) setNewDashId(dashId); navigate(`/${view}`); }} 
                      loggedInUser={loggedInUser} 
                      initialClient={loginClient} 
                      initialPublisher={loginPublisher} 
                      onOpenRecord={r => { setDashboardTarget(r); navigate('/dashboards'); }} 
                    />
                } />

                <Route path="/queue" element={<QueueView />} />
                
                <Route path="/dashboards" element={
                  <DashboardsView 
                    seed={dashboardSeed} 
                    onSeedConsumed={() => setDashboardSeed(null)} 
                    loginClient={loginClient} 
                    loginPublisher={loginPublisher} 
                    targetRecord={dashboardTarget} 
                    onTargetConsumed={() => setDashboardTarget(null)} 
                    loggedInUser={loggedInUser} 
                    newDashId={newDashId} 
                    onNewDashConsumed={() => setNewDashId(null)} 
                  />
                } />
                
                <Route path="/clients" element={<ClientsView />} />
                <Route path="/help" element={<HelpView />} />
                <Route path="/settings" element={<SettingsView theme={theme} onThemeChange={setTheme} />} />
                
                <Route path="*" element={<Navigate to="/extract" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
