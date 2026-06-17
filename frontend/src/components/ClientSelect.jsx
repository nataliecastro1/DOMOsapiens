import React, { useState, useRef, useEffect } from 'react';
import { CLIENTS } from '../data';
import { addClient } from '../services/api';

export default function ClientSelect({ value, onChange, clients }) {
  const list = (clients && clients.length) ? clients : CLIENTS;

  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving]   = useState(false);
  const wrapRef  = useRef(null);
  const addRef   = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setAdding(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (adding && addRef.current) addRef.current.focus();
  }, [adding]);

  const q = query.trim().toLowerCase();
  const filtered = (q
    ? list.filter(c => c.toLowerCase().includes(q)).sort((a, b) => {
        const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.localeCompare(b, undefined, { sensitivity: 'base' });
      })
    : list
  ).slice(0, 50);

  const choose = (name) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const handleSaveNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try { await addClient(name); } catch (_) {}
    onChange(name);
    setQuery(name);
    setAdding(false);
    setNewName('');
    setOpen(false);
    setSaving(false);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown')    { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter')   { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (e.key === 'Escape')  { setOpen(false); }
  };

  const display = open ? query : (value || '');

  return (
    <div ref={wrapRef} className="client-select">
      {/* Input row with "+" button */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div className={`client-select-field${open ? ' open' : ''}`} style={{ flex: 1 }}>
          <input
            type="text"
            className="client-select-input"
            value={display}
            placeholder="Type or select a client…"
            aria-label="Client"
            onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => { setQuery(value || ''); setOpen(true); setActive(0); }}
            onKeyDown={handleKeyDown}
          />
          <i className={`ti ti-chevron-down client-select-caret${open ? ' open' : ''}`} aria-hidden="true" />
        </div>

        <button
          type="button"
          title="Add new client"
          onClick={() => { setAdding(a => !a); setOpen(false); setNewName(''); }}
          style={{
            flexShrink: 0, width: 42, height: 42, borderRadius: 10,
            border: '1.5px solid var(--blue)', background: adding ? 'var(--blue)' : 'var(--blue-pale)',
            color: adding ? '#fff' : 'var(--blue)', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <i className={`ti ${adding ? 'ti-x' : 'ti-plus'}`} />
        </button>
      </div>

      {/* Dropdown list */}
      {open && filtered.length > 0 && (
        <ul className="client-select-list" role="listbox">
          {filtered.map((c, i) => (
            <li
              key={c}
              role="option"
              aria-selected={c === value}
              className={`client-select-option${i === active ? ' active' : ''}${c === value ? ' selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(c); }}
              onMouseEnter={() => setActive(i)}
            >
              {c}
            </li>
          ))}
        </ul>
      )}

      {/* Inline add form */}
      {adding && (
        <div style={{
          marginTop: 6, padding: '10px 12px',
          border: '1.5px solid var(--blue)', borderRadius: 10,
          background: 'var(--blue-pale)', display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <input
            ref={addRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveNew();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            placeholder="Type new client name…"
            style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
          />
          <button
            type="button"
            onClick={handleSaveNew}
            disabled={!newName.trim() || saving}
            style={{
              background: newName.trim() ? 'var(--blue)' : 'var(--border)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              cursor: newName.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
