import React, { useState, useRef, useEffect } from 'react';
import { CLIENTS } from '../data';
import { addClient } from '../services/api';

// Typable client picker. The list comes from `clients` (loaded from the SME's
// real folders at login); if that hasn't been loaded it falls back to the
// CLIENTS mock so the field is never empty. Filtering matches anywhere in the
// name but sorts names that start with the query first. Free text is allowed —
// the SME can type a client that isn't in the list — so nothing is ever forced.
export default function ClientSelect({ value, onChange, clients }) {
  const list = (clients && clients.length) ? clients : CLIENTS;

  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (q
    ? list
        .filter(c => c.toLowerCase().includes(q))
        .sort((a, b) => {
          const ap = a.toLowerCase().startsWith(q) ? 0 : 1;   // prefix matches first
          const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
          return ap - bp || a.localeCompare(b, undefined, { sensitivity: 'base' });
        })
    : list
  ).slice(0, 50);   // cap the visible list; keep typing to narrow further

  const choose = (name, isNew = false) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
    if (isNew) addClient(name).catch(() => {});
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown')      { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter')     {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
      else if (query.trim()) choose(query.trim(), true);
    }
    else if (e.key === 'Escape')    { setOpen(false); }
  };

  // Show the committed value when closed; show what the SME is typing when open.
  const display = open ? query : (value || '');

  return (
    <div className="client-select" ref={wrapRef}>
      <div className={`client-select-field${open ? ' open' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          className="client-select-input"
          value={display}
          placeholder="Type a client name…"
          aria-label="Client"
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => { setQuery(value || ''); setOpen(true); setActive(0); }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && (
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
          {q && !filtered.find(c => c.toLowerCase() === q) ? (
            <li
              role="option"
              className="client-select-option client-select-add"
              onMouseDown={(e) => { e.preventDefault(); choose(query.trim(), true); }}
            >
              <i className="ti ti-plus" style={{ marginRight: 6, color: 'var(--blue)' }} />
              Add &ldquo;{query.trim()}&rdquo;
            </li>
          ) : (
            <li
              role="option"
              className="client-select-option client-select-add"
              onMouseDown={(e) => { e.preventDefault(); setQuery(''); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
              style={{ borderTop: filtered.length ? '1px solid var(--border-light)' : 'none' }}
            >
              <i className="ti ti-plus" style={{ marginRight: 6, color: 'var(--blue)' }} />
              Add new…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
