import React from 'react';

/** color: 'blue' | 'gold' | 'navy' | 'green' | 'red' | 'amber' */
export default function Badge({ color = 'navy', children }) {
  return <span className={`badge ${color}`}>{children}</span>;
}
