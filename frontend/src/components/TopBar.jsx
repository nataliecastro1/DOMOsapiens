import React from 'react';

export default function TopBar({ ctxLabel }) {
  return (
    <div className="topbar">
      <a className="topbar-logo" href="#">
        <svg width="24" height="24" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="10" stroke="#ffad00" strokeWidth="1.2" />
          <path d="M6 16L11 6L16 16" stroke="#ffad00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 12.5L14 12.5" stroke="#ffad00" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="topbar-logo-text">ANGLEPOINT</span>
      </a>
      <span className="topbar-ctx">{ctxLabel}</span>
      <div className="topbar-right">
        <div className="topbar-avatar">CD</div>
        <span className="topbar-user">Christina D.</span>
      </div>
    </div>
  );
}
