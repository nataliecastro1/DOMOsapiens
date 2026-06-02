import React from 'react';

export default function TopBar({ ctxLabel }) {
  return (
    <div className="topbar">
      <a className="topbar-logo" href="#">
        <img src="/anglepoint-logo.png" alt="Anglepoint" style={{ height: 30 }} />
      </a>
      <span className="topbar-ctx">{ctxLabel}</span>
      <div className="topbar-right">
        <div className="topbar-avatar">CD</div>
        <span className="topbar-user">Christina D.</span>
      </div>
    </div>
  );
}
