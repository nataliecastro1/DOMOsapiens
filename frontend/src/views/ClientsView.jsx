import React from 'react';
import Badge from '../components/Badge';

const CLIENTS = [
  { name: 'Encova Insurance', sub: '12 extractions · 4 publishers · 2022–2025', status: 'Active', color: 'green' },
  { name: 'Northgate LLC',    sub: '6 extractions · 2 publishers · 2023–2025',  status: 'Active', color: 'green' },
  { name: 'Acme Corp',        sub: '3 extractions · 1 publisher · 2025',        status: 'New',    color: 'navy'  },
];

export default function ClientsView() {
  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-users" aria-hidden="true" /> Active Clients
      </div>
      <div className="client-cards">
        {CLIENTS.map(c => (
          <div className="client-card" key={c.name}>
            <div>
              <div className="client-card-name">{c.name}</div>
              <div className="client-card-sub">{c.sub}</div>
            </div>
            <Badge color={c.color}>{c.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
