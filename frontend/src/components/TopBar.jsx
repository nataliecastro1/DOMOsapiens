import React, { useState, useRef, useEffect } from 'react';

export default function TopBar({ ctxLabel, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="topbar">
      <a className="topbar-logo" href="#">
        <img src="/anglepoint-logo.png" alt="Anglepoint" style={{ height: 28 }} />
      </a>
      <span className="topbar-ctx">{ctxLabel}</span>

      <div className="topbar-right" ref={ref} style={{ position: 'relative' }}>
        {/* Clickable user area */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <div className="topbar-avatar">CD</div>
          <span className="topbar-user">Christina D.</span>
          <i className="ti ti-chevron-down" style={{ fontSize: 12, color: '#c8d4e8', marginLeft: 2 }} />
        </button>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
            background: '#fff', border: '1px solid #e2e7ef', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 160, zIndex: 100,
          }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f3f8' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#001941' }}>Christina D.</div>
              <div style={{ fontSize: 11, color: '#6b7fa3' }}>christina</div>
            </div>
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '10px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: '#c94040', fontFamily: 'inherit',
              }}
            >
              <i className="ti ti-logout" style={{ fontSize: 15 }} />
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
