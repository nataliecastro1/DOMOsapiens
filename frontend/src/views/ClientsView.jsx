import React, { useState, useEffect, useMemo } from 'react';
import Badge from '../components/Badge';
import { getRecords } from '../services/api';

// ─── Client Detail Panel ──────────────────────────────────────────────────────
function ClientDetail({ client, records, onClose }) {
  const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';
  const confColor = (c) => c >= 90 ? 'green' : c >= 75 ? 'amber' : 'red';
  const confLabel = (c) => c >= 90 ? 'High' : c >= 75 ? 'Medium' : 'Low';

  const totalSavings = (r) => {
    const sum = [r.id_cost_avoidance, r.acc_cost_avoidance, r.id_cost_optimization,
                 r.acc_cost_optimization, r.realized_savings].reduce((a, v) => a + (v || 0), 0);
    return sum > 0 ? `$${sum.toLocaleString()}` : '—';
  };

  const publishers = [...new Set(records.map(r => r.publisher).filter(Boolean))];
  const years      = [...new Set(records.map(r => r.year).filter(Boolean))].sort();

  return (
    <div className="detail-panel" style={{ marginTop: 16 }}>
      <div className="detail-header">
        <span className="detail-header-title">{client}</span>
        <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-muted)' }}>
        <span><strong style={{ color: 'var(--text)' }}>{records.length}</strong> extraction{records.length !== 1 ? 's' : ''}</span>
        <span><strong style={{ color: 'var(--text)' }}>{publishers.length}</strong> publisher{publishers.length !== 1 ? 's' : ''}: {publishers.join(', ')}</span>
        <span>Years: <strong style={{ color: 'var(--text)' }}>{years.join(', ') || '—'}</strong></span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Year</th><th>Publisher</th><th>Total Savings</th><th>Confidence</th>
              <th>SME</th><th>Source File</th><th>Date Stored</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td>{r.year}</td>
                <td>{r.publisher}</td>
                <td style={{ fontWeight: 600 }}>{totalSavings(r)}</td>
                <td>{r.confidence != null ? <Badge color={confColor(r.confidence)}>{confLabel(r.confidence)}</Badge> : '—'}</td>
                <td>{r.sme || '—'}</td>
                <td style={{ fontSize: 11 }}>
                  {r.stored_name
                    ? <a href={`http://localhost:8000/api/uploads/${r.stored_name}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{r.source_file || r.stored_name}</a>
                    : <span style={{ color: 'var(--text-muted)' }}>{r.source_file || '—'}</span>}
                </td>
                <td style={{ color: 'var(--text-faint)', fontSize: 11 }}>{r.saved_at ? new Date(r.saved_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ClientsView ──────────────────────────────────────────────────────────────
export default function ClientsView() {
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [sortBy, setSortBy]         = useState('alpha');
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => {
    getRecords()
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  // Group records by client
  const clientMap = useMemo(() => {
    const map = {};
    for (const r of records) {
      const key = r.client || 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [records]);

  const clients = useMemo(() => {
    let list = Object.entries(clientMap).map(([name, recs]) => {
      const publishers = [...new Set(recs.map(r => r.publisher).filter(Boolean))];
      const years      = [...new Set(recs.map(r => r.year).filter(Boolean))].sort();
      const latest     = recs.reduce((a, r) => (!a || r.saved_at > a) ? r.saved_at : a, null);
      return { name, recs, publishers, years, latest };
    });

    if (search.trim()) {
      list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }

    if (sortBy === 'alpha')   list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'alpha-z') list.sort((a, b) => b.name.localeCompare(a.name));
    if (sortBy === 'recent')  list.sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
    if (sortBy === 'count')   list.sort((a, b) => b.recs.length - a.recs.length);

    return list;
  }, [clientMap, search, sortBy]);

  return (
    <>
      {/* Search + sort bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }} />
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
          />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: 160 }}>
          <option value="alpha">A → Z</option>
          <option value="alpha-z">Z → A</option>
          <option value="recent">Most Recent</option>
          <option value="count">Most Extractions</option>
        </select>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading clients…</p>}

      {!loading && clients.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          {search ? `No clients match "${search}"` : 'No extractions stored yet. Complete an extraction to see clients here.'}
        </div>
      )}

      <div className="client-cards">
        {clients.map(c => {
          const isSelected = selectedClient === c.name;
          const yearRange = c.years.length > 1 ? `${c.years[0]}–${c.years[c.years.length - 1]}` : c.years[0] || '—';
          return (
            <React.Fragment key={c.name}>
              <div
                className={`client-card clickable${isSelected ? ' selected' : ''}`}
                onClick={() => setSelectedClient(isSelected ? null : c.name)}
                style={{ cursor: 'pointer', borderColor: isSelected ? 'var(--blue)' : undefined }}
              >
                <div>
                  <div className="client-card-name">{c.name}</div>
                  <div className="client-card-sub">
                    {c.recs.length} extraction{c.recs.length !== 1 ? 's' : ''} · {c.publishers.length} publisher{c.publishers.length !== 1 ? 's' : ''} · {yearRange}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge color="green">Active</Badge>
                  <i className={`ti ${isSelected ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: 'var(--text-muted)', fontSize: 13 }} />
                </div>
              </div>
              {isSelected && (
                <ClientDetail
                  client={c.name}
                  records={c.recs}
                  onClose={() => setSelectedClient(null)}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
