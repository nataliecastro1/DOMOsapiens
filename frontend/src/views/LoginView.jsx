import React, { useState } from 'react';
import { BASE } from '../services/api';

// Shown only when GET /api/auth/me reports no identity.
//
// There is deliberately no password field. Authentication is Alfred SSO when
// deployed and an automatic dev user locally, so this screen is unreachable in
// normal operation — it exists to explain an unexpected state rather than to
// gate access. The form this replaced compared a hardcoded username against a
// password kept in localStorage, which offered no protection at all: the check
// ran in the browser, so anyone could bypass it from the console.
export default function LoginView() {
  const [checking, setChecking] = useState(false);

  const retry = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE}/auth/me`);
      const me = await res.json();
      if (me.authenticated) {
        window.location.reload();
        return;
      }
    } catch {
      /* fall through to the message below */
    }
    setChecking(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ marginBottom: 36 }}>
          <img src={`${import.meta.env.BASE_URL}anglepoint-logo.png`} alt="Anglepoint" style={{ height: 32 }} />
        </div>

        <div className="login-title">Sign-in required</div>
        <div className="login-sub">ROI Extraction Platform</div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '18px 0 22px' }}>
          This app uses your Anglepoint single sign-on. We could not read an
          identity for this session, which usually means the page was opened
          outside the Alfred gateway.
        </p>

        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
          Open it from the Alfred dashboard, or from the Delivery Hub&apos;s
          Status View ROI button, and your session will carry over.
        </p>

        <button type="button" className="btn primary login-submit" onClick={retry} disabled={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </div>
  );
}
