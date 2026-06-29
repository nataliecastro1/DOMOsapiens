import React, { useState } from 'react';

export default function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const storedPassword = localStorage.getItem('app_password') || '123456';
    if (username === 'christina' && password === storedPassword) {
      setError('');
      onLogin(username);
    } else {
      setError('Incorrect username or password.');
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ marginBottom: 36 }}>
          <img src="/anglepoint-logo.png" alt="Anglepoint" style={{ height: 32 }} />
        </div>

        <div className="login-title">Sign in</div>
        <div className="login-sub">ROI Extraction Platform</div>

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="login-user">Username</label>
            <input
              id="login-user"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="login-pass">Password</label>
            <input
              id="login-pass"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn primary login-submit">
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
