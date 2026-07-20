import React from 'react';

export default function SettingsView({ theme, onThemeChange }) {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Appearance */}
      <div className="card" style={{ padding: '28px 32px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 18 }}>
          Appearance
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Theme</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
              {theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}
            </div>
          </div>
          <button
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', borderRadius: 12,
              border: '1.5px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`} style={{ fontSize: 18 }} />
            Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
          </button>
        </div>

        {/* Preview chips */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          {['light', 'dark'].map(t => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 12, cursor: 'pointer',
                border: theme === t ? '2px solid var(--gold)' : '2px solid var(--border)',
                background: t === 'dark' ? '#080e1f' : '#f2f4f6',
                color: t === 'dark' ? '#e8edf5' : '#001941',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'border-color 0.2s',
              }}
            >
              <i className={`ti ${t === 'dark' ? 'ti-moon' : 'ti-sun'}`} style={{ fontSize: 22, color: t === 'dark' ? '#ffad00' : '#005f86' }} />
              {t === 'dark' ? 'Dark' : 'Light'}
              {theme === t && (
                <span style={{ fontSize: 10, color: '#ffad00', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Active</span>
              )}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
