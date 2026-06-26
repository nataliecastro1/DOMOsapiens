import React, { useState } from 'react';

export default function SettingsView({ theme, onThemeChange }) {
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwMsg, setPwMsg]           = useState(null); // { type: 'success'|'error', text }

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setPwMsg(null);
    const stored = localStorage.getItem('app_password') || '123456';
    if (currentPw !== stored) {
      setPwMsg({ type: 'error', text: 'Current password is incorrect.' });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    localStorage.setItem('app_password', newPw);
    setPwMsg({ type: 'success', text: 'Password updated successfully.' });
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
  };

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

      {/* Change Password */}
      <div className="card" style={{ padding: '28px 32px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 18 }}>
          Security
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>Change Password</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Update your login password.</div>

        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Current Password
            </label>
            <input
              type="password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className="field-input"
              placeholder="Enter current password"
              required
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              New Password
            </label>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="field-input"
              placeholder="At least 6 characters"
              required
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              className="field-input"
              placeholder="Repeat new password"
              required
            />
          </div>

          {pwMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: pwMsg.type === 'success' ? 'var(--green-pale)' : 'var(--red-pale)',
              color:      pwMsg.type === 'success' ? 'var(--green-text)' : 'var(--red-text)',
              border:     `1px solid ${pwMsg.type === 'success' ? 'var(--green)' : 'var(--red)'}`,
            }}>
              <i className={`ti ${pwMsg.type === 'success' ? 'ti-circle-check' : 'ti-alert-circle'}`} style={{ marginRight: 6 }} />
              {pwMsg.text}
            </div>
          )}

          <button type="submit" className="btn primary" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <i className="ti ti-lock" /> Update Password
          </button>
        </form>
      </div>
    </div>
  );
}
