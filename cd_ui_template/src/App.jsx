import React, { useState } from 'react';
import TopBar        from './components/TopBar';
import Sidebar       from './components/Sidebar';
import ExtractionView  from './views/ExtractionView';
import DashboardsView  from './views/DashboardsView';
import TrackerView     from './views/TrackerView';
import ClientsView     from './views/ClientsView';
import HelpView        from './views/HelpView';

const VIEW_META = {
  extract:    { title: 'ROI Report Extraction', sub: 'Extract, validate, and store client ROI data',                               ctx: '/ ROI Extraction' },
  dashboards: { title: 'Dashboards',             sub: 'Build and save custom ROI views',                                            ctx: '/ Dashboards'     },
  tracker:    { title: 'ROI Tracker',            sub: 'Client_ROI_Tracker.xlsx — All_ROI_Data · SME_Audit_Log · Source_File_Log',  ctx: '/ ROI Tracker'    },
  clients:    { title: 'Clients',                sub: 'Manage active client accounts',                                              ctx: '/ Clients'        },
  help:       { title: 'Help & Docs',            sub: 'Quick reference and documentation',                                          ctx: '/ Help'           },
};

export default function App() {
  const [activeView, setActiveView] = useState('extract');
  const meta = VIEW_META[activeView] || VIEW_META.extract;

  const renderView = () => {
    switch (activeView) {
      case 'extract':    return <ExtractionView onNav={setActiveView} />;
      case 'dashboards': return <DashboardsView />;
      case 'tracker':    return <TrackerView />;
      case 'clients':    return <ClientsView />;
      case 'help':       return <HelpView />;
      default:           return <ExtractionView onNav={setActiveView} />;
    }
  };

  const TopstripAction = () => {
    if (activeView !== 'extract') return null;
    return (
      <button className="btn primary" onClick={() => setActiveView('extract')}>
        <i className="ti ti-plus" aria-hidden="true" /> New Extraction
      </button>
    );
  };

  return (
    <div className="app">
      <TopBar ctxLabel={meta.ctx} />
      <div className="app-body">
        <Sidebar activeView={activeView} onNav={setActiveView} />
        <main className="main">
          <div className="topstrip">
            <div>
              <div className="page-title">{meta.title}</div>
              <div className="page-sub">{meta.sub}</div>
            </div>
            <TopstripAction />
          </div>
          <div className="content">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
