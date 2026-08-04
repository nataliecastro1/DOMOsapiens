import React from 'react';

// Shown instead of the extraction UI when the signed-in user's delivery-hub
// roster role isn't allowed to spend ROI engine credits. Mirrors the hub's
// "SDT Hub Guard Bot" access screen; built with this app's plain CSS rather
// than the hub's framer-motion/lucide stack, which isn't a dependency here.
//
// This is the friendly explanation — the actual enforcement lives server-side
// in the hub (rbac::require_role on /v1/roi/extract).
export default function AccessGuard({ role, allowedRoles = [], user }) {
  const roleLabel = role || 'unassigned';
  return (
    <div style={{ maxWidth: 680, margin: '32px auto' }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', background: 'var(--surface-2, #f8fafc)',
          borderBottom: '1px solid var(--border)', fontSize: 11,
          fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em',
        }}>
          <i className="ti ti-shield-check" style={{ color: 'var(--blue)' }} />
          SDT HUB GUARD BOT
        </div>

        <div style={{
          height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(90deg, var(--surface-2, #f8fafc), var(--blue-pale, #eff6ff))',
          borderBottom: '1px solid var(--border)', position: 'relative',
        }}>
          <div style={{ fontSize: 46, animation: 'guard-walk 9s ease-in-out infinite' }}>
            <i className="ti ti-robot" style={{ color: 'var(--blue)' }} />
          </div>
          <div style={{
            position: 'absolute', top: 12, left: 28,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 700,
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <i className="ti ti-lock" style={{ color: 'var(--blue)' }} /> Access Guard
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            ROI extraction isn’t enabled for your role
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {user ? <>You’re signed in as <b>{user}</b>. </> : null}
            Your delivery-hub role is <b>{roleLabel}</b>, and the ROI extraction
            engine is limited to{' '}
            <b>{allowedRoles.length ? allowedRoles.join(', ') : 'approved roles'}</b>{' '}
            because each run consumes AI credits.
          </div>
          <div style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 10,
            background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
          }}>
            Ask an SDT Hub admin to set your roster role in{' '}
            <b>Admin → Access</b>. Everything else here — the tracker, dashboards,
            and exports — stays available to you.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes guard-walk {
          0%   { transform: translateX(-120px) scaleX(1); }
          48%  { transform: translateX(120px) scaleX(1); }
          50%  { transform: translateX(120px) scaleX(-1); }
          98%  { transform: translateX(-120px) scaleX(-1); }
          100% { transform: translateX(-120px) scaleX(1); }
        }
      `}</style>
    </div>
  );
}
