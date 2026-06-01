import React, { useState } from 'react';

export default function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === 'christina' && password === '123456') {
      setError('');
      onLogin();
    } else {
      setError('Incorrect username or password.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#edf0f5',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #c8cdd8',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)', width: 360, padding: 40,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" stroke="#ffad00" strokeWidth="1.2" />
            <path d="M6 16L11 6L16 16" stroke="#ffad00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 12.5L14 12.5" stroke="#ffad00" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#001941', letterSpacing: 0.6 }}>ANGLEPOINT</span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, color: '#001941', marginBottom: 4 }}>Sign in</div>
        <div style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 28 }}>ROI Extraction Platform</div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7fa3', display: 'block', marginBottom: 4 }}>
              USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7fa3', display: 'block', marginBottom: 4 }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div style={{
              background: '#fdeaea', border: '1px solid #c94040', borderRadius: 5,
              padding: '8px 12px', fontSize: 12, color: '#7c1a1a', marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 18px', fontSize: 13 }}
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
