import React, { useEffect, useMemo, useState } from 'react';
import { getHubClientScopes, getHubDeliverables, saveRoiToHub } from '../services/hub';
import { updateRecord } from '../services/api';

// Push one reviewed tracker record into the delivery hub's roi_metrics.
// Flow: pick the hub client scope (pre-matched against the record's client
// name), pick the SOW deliverable it belongs to, send. The call runs in the
// browser so the user's own Alfred session authenticates it — the hub's
// audit log records them, not a service account.
export default function SendToHubModal({ record, onClose }) {
  const [scopes, setScopes] = useState(null);         // null = loading
  const [scopeId, setScopeId] = useState('');
  const [deliverables, setDeliverables] = useState(null);
  const [deliverableId, setDeliverableId] = useState('');
  const [phase, setPhase] = useState('idle');          // idle | sending | done
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // Set when the hub accepted the push but the local back-reference could not be
  // stored — a caveat on success, not a failure.
  const [linkWarning, setLinkWarning] = useState('');

  useEffect(() => {
    getHubClientScopes()
      .then(list => {
        setScopes(list);
        if (record.hub_scope_id) {
          const hit = list.find(s => s.id === record.hub_scope_id);
          if (hit) { setScopeId(hit.id); return; }
        }
        // A record created from the Status View ROI button already knows its
        // pathfinder id — match that rather than guessing from the client name.
        if (record.hub_pathfinder_id) {
          const hit = list.find(s => s.pathfinder_id === record.hub_pathfinder_id);
          if (hit) { setScopeId(hit.id); return; }
        }
        // Otherwise preselect the scope whose name contains the record's client.
        const client = (record.client || '').toLowerCase();
        if (client) {
          const hit = list.find(s => {
            const n = s.name.toLowerCase();
            return n.includes(client) || client.includes(n);
          });
          if (hit) setScopeId(hit.id);
        }
      })
      .catch(e => { setScopes([]); setError(e.message); });
  }, [record]);

  useEffect(() => {
    if (!scopeId) { setDeliverables(null); setDeliverableId(''); return; }
    setDeliverables(null);
    setDeliverableId('');
    getHubDeliverables(scopeId)
      .then(list => {
        setDeliverables(list);
        // Same for the deliverable the hub sent us to.
        const handoff = record.hub_deliverable_id;
        if (handoff && list.some(d => d.id === handoff)) setDeliverableId(String(handoff));
      })
      .catch(e => { setDeliverables([]); setError(e.message); });
  }, [scopeId, record]);

  const canSend = scopeId && deliverableId && phase !== 'sending';
  const scopeName = useMemo(
    () => (scopes || []).find(s => s.id === scopeId)?.name || '',
    [scopes, scopeId],
  );

  const send = async () => {
    setPhase('sending');
    setError('');
    try {
      const res = await saveRoiToHub(record, {
        deliverableId: Number(deliverableId),
        clientScopeId: scopeId,
      });
      setResult(res);
      setPhase('done');

      // Store the hub references back on our record so the link is visible
      // here too, and a re-send targets the same row. Best-effort: the hub
      // already has the data, so a failure here must not look like a failure.
      try {
        await updateRecord(record.record_id, {
          changes: {
            hub_deliverable_id: Number(deliverableId),
            hub_deliverable_name:
              deliverables?.find(d => String(d.id) === String(deliverableId))?.deliverable_name || null,
            hub_roi_metric_id: res?.id ?? null,
            hub_saved_at: new Date().toISOString(),
          },
          note: `Pushed to delivery hub (${scopeName})`,
        });
      } catch (e) {
        // The hub already has the data, so this is not a failed send — but the
        // user needs to know the local record is not linked, which happens when
        // another record already claims this deliverable.
        console.warn('[hub] record saved to hub but back-reference not stored:', e.message);
        setLinkWarning(e.message);
      }
    } catch (e) {
      setError(e.message);
      setPhase('idle');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: 460, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            <i className="ti ti-send" style={{ marginRight: 6, color: 'var(--blue)' }} />
            Send to Delivery Hub
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' }}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          {record.client || '—'} · {record.publisher || '—'} · {record.year || '—'}
        </div>

        {phase === 'done' ? (
          <div>
            <div style={{
              background: 'var(--green-pale, #e8f5ec)', border: '1.5px solid var(--green, #2e9e5b)',
              borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 14,
            }}>
              <i className="ti ti-circle-check" style={{ marginRight: 6, color: 'var(--green, #2e9e5b)' }} />
              Saved to the hub as ROI record #{result?.id} under <b>{scopeName}</b>
              {result?.updated ? ' (updated an existing entry).' : '.'}
            </div>
            {linkWarning && (
              <div style={{
                background: 'var(--amber-pale, #fdf6e3)', border: '1.5px solid var(--amber, #b7791f)',
                borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 14,
                color: '#7a5200', lineHeight: 1.5,
              }}>
                <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} />
                The hub has the data, but this record could not be linked to it: {linkWarning}
              </div>
            )}
            <button className="btn primary" onClick={onClose} style={{ width: '100%' }}>Close</button>
          </div>
        ) : (
          <div>
            <div className="field-group">
              <label className="field-label">Hub client scope</label>
              {scopes === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading scopes…</div>
              ) : (
                <select value={scopeId} onChange={e => setScopeId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select a client scope…</option>
                  {scopes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>

            <div className="field-group">
              <label className="field-label">SOW deliverable</label>
              {!scopeId ? (
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Pick a scope first.</div>
              ) : deliverables === null ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading deliverables…</div>
              ) : deliverables.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No open deliverables on this scope.</div>
              ) : (
                <select value={deliverableId} onChange={e => setDeliverableId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select a deliverable…</option>
                  {deliverables.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.deliverable_name}{d.has_roi ? ' (has ROI — will update)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {error && (
              <div style={{ color: 'var(--red)', fontSize: 12, margin: '10px 0', wordBreak: 'break-word' }}>
                {error}
              </div>
            )}

            <button className="btn primary" onClick={send} disabled={!canSend} style={{ width: '100%', marginTop: 6 }}>
              {phase === 'sending'
                ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />Sending…</>
                : <><i className="ti ti-send" style={{ marginRight: 6 }} />Send to Hub</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
