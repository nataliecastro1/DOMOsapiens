import React, { useEffect, useState } from 'react';
import { getClients, addClient } from '../services/api';

// DB-backed client dropdown. Loads the roster from /api/clients and lets the
// SME add a new client inline, which is persisted server-side and immediately
// selectable. Falls back gracefully if the backend is unreachable.
export default function ClientSelect({ value, onChange }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let active = true;
    getClients()
      .then(list => {
        if (!active) return;
        setClients(list);
        if (!value && list.length) onChange(list[0]);
      })
      .catch(e => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const cancelAdd = () => { setAdding(false); setNewName(''); setError(null); };

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await addClient(name);
      setClients(res.clients);
      onChange(res.name);
      setNewName('');
      setAdding(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={loading}
      >
        {loading
          ? <option>Loading…</option>
          : clients.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {!adding ? (
        <button
          type="button"
          onClick={() => { setAdding(true); setError(null); }}
          style={{
            marginTop: 8, background: 'none', border: 'none', padding: 0,
            color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <i className="ti ti-plus" aria-hidden="true" /> Add new client
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            autoFocus
            type="text"
            value={newName}
            placeholder="New client name"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') cancelAdd();
            }}
            style={{ flex: 1 }}
          />
          <button
            className="btn small primary"
            onClick={handleAdd}
            disabled={saving || !newName.trim()}
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button className="btn small ghost" onClick={cancelAdd} disabled={saving}>
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--red-text)', fontSize: 12, marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
