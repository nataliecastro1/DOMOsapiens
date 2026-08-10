import React, { useState, useEffect } from 'react';
import { getAllowedPublishers } from '../../services/workstreams';
import { getHubContext } from '../../services/hubContext';

// ─── Publisher picker ─────────────────────────────────────────────────────────
// ROI is reported per publisher, but the hub hands us a workstream (its team).
// When that workstream maps to a known publisher set we constrain the choice to
// it and preselect the default; otherwise we fall back to a free-text field with
// suggestions, so an unmapped workstream never blocks a review.
function PublisherField({ value, onChange, placeholder }) {
  const [options, setOptions] = useState([]);
  const [mapped, setMapped] = useState(false);

  useEffect(() => {
    let active = true;
    const ctx = getHubContext();
    getAllowedPublishers(ctx?.workstream).then(res => {
      if (!active) return;
      const list = res.publishers || [];
      setOptions(list);
      setMapped(Boolean(res.mapped));
      // Only fill a blank field — never overwrite what the extractor found.
      if (!value && res.mapped && list.length) {
        onChange((list.find(p => p.is_default) || list[0]).publisher);
      }
    });
    return () => { active = false; };
    // Runs once: the hub handoff is fixed for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mapped && options.length) {
    return (
      <select
        className="compare-record-detail-input"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        {!value && <option value="">Select a publisher…</option>}
        {options.map(o => (
          <option key={o.publisher} value={o.publisher}>{o.publisher}</option>
        ))}
      </select>
    );
  }

  return (
    <>
      <input
        type="text"
        list="known-publishers"
        className="compare-record-detail-input"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <datalist id="known-publishers">
        {options.map(o => <option key={o.publisher} value={o.publisher} />)}
      </datalist>
    </>
  );
}


export default PublisherField;
