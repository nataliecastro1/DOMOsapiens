import React, { useState } from 'react';

// Self-contained component: click the button, it fetches the Alfred client
// scopes from our backend and logs them to the console. If we're not
// authenticated yet, it runs the device-auth flow (opens the approval tab,
// polls until approved) and then fetches.
//
// Relies on the Vite dev proxy mapping /api -> http://localhost:8000.
export default function ClientScopesButton() {
  const [status, setStatus] = useState('idle'); // idle | authing | loading | done | error

  async function fetchScopes() {
    const res = await fetch('/api/client-scopes');
    if (res.status === 401) return null; // not authenticated
    if (!res.ok) throw new Error(`GET /api/client-scopes failed: ${res.status}`);
    return res.json();
  }

  async function authenticate() {
    setStatus('authing');
    const start = await (await fetch('/api/auth/start', { method: 'POST' })).json();
    console.log('[client-scopes] Approve access here:', start.verification_uri_complete);
    window.open(start.verification_uri_complete, '_blank', 'noopener');

    // Poll until the device flow reaches a terminal state.
    const intervalMs = (start.interval || 5) * 1000;
    const deadline = Date.now() + (start.expires_in || 600) * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const { state } = await (await fetch('/api/auth/status')).json();
      console.log('[client-scopes] auth state:', state);
      if (state === 'authenticated') return true;
      if (state === 'denied' || state === 'expired') return false;
    }
    return false;
  }

  async function handleClick() {
    try {
      setStatus('loading');
      let scopes = await fetchScopes();

      if (scopes === null) {
        const ok = await authenticate();
        if (!ok) {
          console.warn('[client-scopes] authentication was not completed.');
          setStatus('error');
          return;
        }
        setStatus('loading');
        scopes = await fetchScopes();
      }

      console.log(`[client-scopes] got ${scopes.length} clients:`, scopes);
      setStatus('done');
    } catch (err) {
      console.error('[client-scopes] error:', err);
      setStatus('error');
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={status === 'loading' || status === 'authing'}>
        {status === 'authing'
          ? 'Waiting for approval…'
          : status === 'loading'
          ? 'Fetching…'
          : 'Click here to fetch client names'}
      </button>
      <p>Open the browser console (F12) to see the results.</p>
    </div>
  );
}
