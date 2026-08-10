import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { id: 'extract',    icon: 'ti-report-analytics', label: 'ROI Extraction', path: '/extract' },
  { id: 'queue',      icon: 'ti-stack-2',          label: 'Queue',          path: '/queue' },
  { id: 'dashboards', icon: 'ti-layout-dashboard',  label: 'Dashboards',    path: '/dashboards' },
];

const BOTTOM_ITEMS = [
  { id: 'help',     icon: 'ti-help-circle', label: 'Help & Docs', path: '/help' },
  { id: 'settings', icon: 'ti-settings',    label: 'Settings',    path: '/settings' },
];

export default function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-section">
        <div className="sidebar-label">Tools</div>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="sidebar-section bottom">
        {BOTTOM_ITEMS.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
