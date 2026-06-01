import React from 'react';

const NAV_ITEMS = [
  { id: 'extract',    icon: 'ti-report-analytics', label: 'ROI Extraction' },
  { id: 'dashboards', icon: 'ti-layout-dashboard',  label: 'Dashboards'     },
  { id: 'tracker',    icon: 'ti-table',              label: 'ROI Tracker'    },
  { id: 'clients',    icon: 'ti-users',              label: 'Clients'        },
];

const BOTTOM_ITEMS = [
  { id: 'help',     icon: 'ti-help-circle', label: 'Help & Docs' },
  { id: 'settings', icon: 'ti-settings',    label: 'Settings'    },
];

export default function Sidebar({ activeView, onNav }) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-section">
        <div className="sidebar-label">Tools</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-section bottom">
        {BOTTOM_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => item.id !== 'settings' && onNav(item.id)}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
