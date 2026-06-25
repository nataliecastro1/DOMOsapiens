/**
 * ExecutiveSummaryReport
 * Interactive, editable executive summary with chatbox for additional info.
 * Sections are dynamic — hidden when empty, expandable when present.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar,
} from 'recharts';
import { augmentExecutiveSummary } from '../services/api';

// ─── Palette ──────────────────────────────────────────────────────────────────
const NAVY   = '#001941';
const BLUE   = '#005f86';
const TEAL   = '#0089af';
const GOLD   = '#ffad00';
const GREEN  = '#2d9e5c';
const RED    = '#c0392b';
const SLATE  = '#4a6a9c';
const CHART_COLORS = [BLUE, TEAL, GOLD, GREEN, SLATE, '#7b68ee', '#e67e22'];

// ─── Custom tooltip for charts ────────────────────────────────────────────────
function DollarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const fmt = v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M`
            : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K`
            : `$${Number(v).toLocaleString()}`;
  return (
    <div style={{ background: NAVY, color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      <div style={{ color: GOLD, fontWeight: 700 }}>{fmt}</div>
    </div>
  );
}

// ─── Section wrapper — collapsible, force-opens when it has new items ─────────
function Section({ icon, title, accentColor = BLUE, defaultOpen = true, hasNew = false, children }) {
  const [open, setOpen] = useState(defaultOpen || hasNew);

  // Force-open when new items land in this section
  React.useEffect(() => { if (hasNew) setOpen(true); }, [hasNew]);

  return (
    <div style={{
      border: hasNew ? `2px solid ${GREEN}` : `1px solid var(--border)`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 12,
      transition: 'border-color 0.3s',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 18px',
          background: hasNew ? '#f0faf4' : 'var(--surface)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.3s',
        }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          background: hasNew ? GREEN + '22' : accentColor + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: hasNew ? GREEN : accentColor, fontSize: 16, flexShrink: 0,
        }}>
          <i className={`ti ${icon}`} />
        </span>
        <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, flex: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        {hasNew && (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: GREEN, color: '#fff', borderRadius: 20, padding: '3px 9px', marginRight: 6,
          }}>
            Updated
          </span>
        )}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ color: 'var(--text-muted)', fontSize: 14 }} />
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Editable text item ───────────────────────────────────────────────────────
function EditableItem({ value, onChange, bullet, bulletColor, isNew = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => { onChange(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: bulletColor, fontWeight: 700, flexShrink: 0, marginTop: 4 }}>{bullet}</span>
        <div style={{ flex: 1 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
            autoFocus
            rows={2}
            style={{
              width: '100%', border: `1.5px solid ${BLUE}`, borderRadius: 6,
              padding: '6px 10px', fontSize: 13, lineHeight: 1.5, resize: 'vertical',
              fontFamily: 'inherit', background: 'var(--blue-pale)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={commit} style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>Save</button>
            <button onClick={cancel} style={{ background: 'var(--border)', color: NAVY, border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.6,
        padding: '8px 10px', borderRadius: 8, cursor: 'text',
        transition: 'background 0.2s',
        background: isNew ? '#e2f5ea' : 'transparent',
        borderLeft: isNew ? `4px solid ${GREEN}` : '4px solid transparent',
      }}
      onMouseEnter={e => e.currentTarget.style.background = isNew ? '#cceedd' : 'var(--blue-pale)'}
      onMouseLeave={e => e.currentTarget.style.background = isNew ? '#e2f5ea' : 'transparent'}
    >
      <span style={{ color: isNew ? GREEN : bulletColor, fontWeight: 700, flexShrink: 0 }}>{bullet}</span>
      <span style={{ flex: 1 }}>{value}</span>
      {isNew && (
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
          background: GREEN, color: '#fff', borderRadius: 20, padding: '2px 8px',
          flexShrink: 0, alignSelf: 'center', whiteSpace: 'nowrap',
        }}>
          ✦ Just added
        </span>
      )}
      <i className="ti ti-pencil" style={{ color: isNew ? GREEN + '99' : 'var(--text-faint)', fontSize: 12, flexShrink: 0, marginTop: 2 }} />
    </div>
  );
}

// ─── Editable overview paragraph ──────────────────────────────────────────────
function EditableOverview({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => { onChange(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          autoFocus
          rows={4}
          style={{
            width: '100%', border: `1.5px solid ${GOLD}`, borderRadius: 8,
            padding: '10px 14px', fontSize: 14, lineHeight: 1.7, resize: 'vertical',
            background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={commit} style={{ background: GOLD, color: NAVY, border: 'none', borderRadius: 6, padding: '6px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
          <button onClick={cancel} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <p
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        fontSize: 14, lineHeight: 1.7, margin: 0, cursor: 'text',
        borderRadius: 8, padding: '6px 10px', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {value}
      <i className="ti ti-pencil" style={{ marginLeft: 8, fontSize: 12, opacity: 0.5 }} />
    </p>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, context, isNew = false }) {
  const [flip, setFlip] = useState(false);
  return (
    <div
      onClick={() => setFlip(f => !f)}
      title="Click to see context"
      style={{
        background: isNew ? '#e8f7ee' : 'var(--blue-pale)',
        borderRadius: 10, padding: '14px 16px',
        flex: '1 1 160px', cursor: 'pointer', transition: 'box-shadow 0.2s',
        border: isNew ? `1.5px solid ${GREEN}88` : `1.5px solid ${BLUE}22`,
        position: 'relative',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = isNew ? `0 0 0 2px ${GREEN}66` : `0 0 0 2px ${BLUE}44`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {isNew && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
          background: GREEN, color: '#fff', borderRadius: 4, padding: '2px 6px',
        }}>New</span>
      )}
      {flip && context ? (
        <>
          <div style={{ fontSize: 11, color: isNew ? GREEN : BLUE, fontWeight: 600, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.5 }}>{context}</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: isNew ? GREEN : BLUE, fontWeight: 600, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{value}</div>
          {context && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>tap for context</div>}
        </>
      )}
    </div>
  );
}

// ─── Category definitions ─────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'key_accomplishments', label: 'Accomplishment', icon: 'ti-circle-check', color: GREEN },
  { key: 'recommendations',     label: 'Recommendation', icon: 'ti-bulb',         color: GOLD  },
  { key: 'primary_risks',       label: 'Risk',           icon: 'ti-alert-triangle',color: RED  },
  { key: 'next_steps',          label: 'Next Step',      icon: 'ti-arrow-right',   color: TEAL },
  { key: 'key_metrics',         label: 'Metric / KPI',   icon: 'ti-chart-bar',     color: BLUE },
  { key: 'additional_insights', label: 'Insight',        icon: 'ti-eye',           color: SLATE},
];

const EXAMPLES_BY_CAT = {
  key_accomplishments: ['Saved $1.2M through contract renegotiation', 'Reduced license overage by 40%'],
  recommendations:     ['Consolidate Oracle licenses before Q3 renewal', 'Implement SAM tooling for cloud assets'],
  primary_risks:       ['Oracle audit exposure: $2.4M', 'Microsoft EA renewal at risk due to undocumented usage'],
  next_steps:          ['Schedule executive review by end of quarter', 'Complete license true-up by July 15'],
  key_metrics:         ['50 new licenses generated', 'Cost avoidance confirmed: $800K'],
  additional_insights: ['Risk reduction of 35% vs prior year', '20 licenses currently in progress'],
};

// ─── Additional info chatbox ──────────────────────────────────────────────────
function AdditionalInfoBox({ onSubmit, loading }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState(null); // null = let AI decide

  const examples = category ? EXAMPLES_BY_CAT[category] : [
    '50 new licenses generated',
    'Oracle audit exposure: $2.4M',
    'Schedule executive review by end of quarter',
  ];

  const submit = () => {
    if (!text.trim() || loading) return;
    onSubmit(text.trim(), category);
  };

  return (
    <div style={{
      border: `1.5px solid ${BLUE}`,
      borderRadius: 12,
      padding: '20px 22px',
      background: 'var(--blue-pale)',
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: BLUE,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18,
        }}>
          <i className="ti ti-message-plus" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>
            What additional information would you like to add?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            The AI will professionally integrate it into the right section of the report.
          </div>
        </div>
      </div>

      {/* Category selector */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Where does this belong? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — AI will decide if left blank)</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map(cat => {
            const active = category === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setCategory(active ? null : cat.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: active ? cat.color : 'white',
                  border: `1.5px solid ${active ? cat.color : cat.color + '55'}`,
                  borderRadius: 20, padding: '5px 12px', fontSize: 12,
                  color: active ? '#fff' : cat.color,
                  cursor: 'pointer', fontWeight: active ? 700 : 500,
                  transition: 'all 0.15s',
                }}
              >
                <i className={`ti ${cat.icon}`} style={{ fontSize: 13 }} />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Example chips — change based on selected category */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {examples.map(ex => (
          <button
            key={ex}
            onClick={() => setText(t => t ? `${t}\n${ex}` : ex)}
            style={{
              background: 'white', border: `1px solid ${BLUE}33`, borderRadius: 20,
              padding: '3px 11px', fontSize: 11, color: BLUE, cursor: 'pointer',
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
        placeholder={
          category
            ? `Describe the ${CATEGORIES.find(c => c.key === category)?.label.toLowerCase()}…`
            : 'Example: 50 licenses were generated and 20 are still in progress. Oracle risk reduced to $1.2M…'
        }
        rows={3}
        style={{
          width: '100%', border: `1.5px solid ${BLUE}55`, borderRadius: 8,
          padding: '10px 14px', fontSize: 13, lineHeight: 1.6, resize: 'vertical',
          fontFamily: 'inherit', background: 'white', color: NAVY,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {category
            ? <>Adding as <strong style={{ color: CATEGORIES.find(c => c.key === category)?.color }}>{CATEGORIES.find(c => c.key === category)?.label}</strong></>
            : 'AI will classify automatically'
          }
        </span>
        <button
          onClick={submit}
          disabled={!text.trim() || loading}
          style={{
            background: text.trim() && !loading ? BLUE : 'var(--border)',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 22px', fontWeight: 700, fontSize: 13,
            cursor: text.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {loading
            ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
            : <><i className="ti ti-sparkles" /> Integrate with AI</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ExecutiveSummaryReport({
  summary: initialSummary,
  subtitle = '',
  client = '',
  publisher = '',
  kpiFields = [],
  innerRef,
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [augmenting, setAugmenting] = useState(false);
  const [augmentError, setAugmentError] = useState(null);
  // toast: { sections: [{label, count}] } shown after augment
  const [toast, setToast] = useState(null);
  // newKeys: Set of "field:index" strings marking newly added items
  const [newKeys, setNewKeys] = useState(new Set());

  // ── Derived chart data ──────────────────────────────────────────────────────
  const barData   = (summary?.charts?.roi_breakdown || []).filter(d => d.value > 0);
  const donutRaw  = summary?.charts?.accomplishment_rate || {};
  const donutData = [
    donutRaw.accomplished > 0 ? { name: 'Accomplished', value: donutRaw.accomplished } : null,
    donutRaw.remaining > 0    ? { name: 'Remaining',    value: donutRaw.remaining    } : null,
  ].filter(Boolean);

  // ── Inline list editor helpers ──────────────────────────────────────────────
  const updateList = useCallback((key, index, newVal) => {
    setSummary(s => ({
      ...s,
      [key]: s[key].map((item, i) => i === index ? newVal : item),
    }));
  }, []);

  const updateField = useCallback((key, value) => {
    setSummary(s => ({ ...s, [key]: value }));
  }, []);

  // ── Augment handler ─────────────────────────────────────────────────────────
  const LIST_FIELDS = ['key_accomplishments', 'recommendations', 'primary_risks', 'market_risks', 'additional_insights', 'next_steps'];
  const SECTION_LABELS = {
    key_accomplishments: 'Key Accomplishments',
    recommendations:     'Recommendations',
    primary_risks:       'Risk Analysis',
    market_risks:        'Risk Analysis',
    additional_insights: 'Additional Insights',
    next_steps:          'Next Steps',
  };

  const handleAugment = async (text, category) => {
    setAugmenting(true);
    setAugmentError(null);
    setToast(null);
    try {
      const hint = category
        ? `The user indicates this information belongs in the "${category}" section. Prioritize placing it there.`
        : '';
      const updated = await augmentExecutiveSummary({
        existing_summary: summary,
        additional_text: hint ? `${hint}\n\n${text}` : text,
        client, publisher,
      });

      // Index-based diff: mark items whose index >= old length (new) or whose text changed
      const keys = new Set();
      const toastSections = [];

      for (const field of LIST_FIELDS) {
        const oldArr = summary[field] || [];
        const newArr = updated[field] || [];
        let added = 0;
        for (let i = 0; i < newArr.length; i++) {
          const isAppended = i >= oldArr.length;
          const isChanged  = !isAppended && newArr[i].trim() !== (oldArr[i] || '').trim();
          if (isAppended || isChanged) {
            keys.add(`${field}:${i}`);
            added++;
          }
        }
        if (added > 0) {
          const label = SECTION_LABELS[field];
          const existing = toastSections.find(s => s.label === label);
          if (existing) existing.count += added;
          else toastSections.push({ label, count: added });
        }
      }
      // key_metrics: new label = new metric
      const oldMetricLabels = new Set((summary.key_metrics || []).map(m => m.label));
      (updated.key_metrics || []).forEach((m, i) => {
        if (!oldMetricLabels.has(m.label)) {
          keys.add(`key_metrics:${i}`);
          const existing = toastSections.find(s => s.label === 'Key Metrics');
          if (existing) existing.count++;
          else toastSections.push({ label: 'Key Metrics', count: 1 });
        }
      });

      setNewKeys(keys);
      setSummary(updated);

      if (toastSections.length > 0) {
        setToast(toastSections);
        setTimeout(() => { setToast(null); setNewKeys(new Set()); }, 12000);
      }
    } catch {
      setAugmentError('Could not integrate the information. Please check your connection.');
    } finally {
      setAugmenting(false);
    }
  };

  if (!summary) return null;

  const hasAccomplishments = summary.key_accomplishments?.length > 0;
  const hasMetrics         = summary.key_metrics?.length > 0;
  const hasRecommendations = summary.recommendations?.length > 0;
  const hasPrimaryRisks    = summary.primary_risks?.length > 0;
  const hasMarketRisks     = summary.market_risks?.length > 0;
  const hasInsights        = summary.additional_insights?.length > 0;
  const hasNextSteps       = summary.next_steps?.length > 0;
  const hasHighlights      = summary.highlights?.length > 0;
  const hasCharts          = barData.length > 0 || donutData.length > 1;

  // Does a given field have any newly added/changed items?
  const sectionHasNew = (field) => (summary[field] || []).some((_, i) => newKeys.has(`${field}:${i}`));
  const metricsHasNew = (summary.key_metrics || []).some((_, i) => newKeys.has(`key_metrics:${i}`));

  return (
    <div>

      {/* ── Additional info chatbox — excluded from PDF ref ─────────────────── */}
      <div className="no-print">
        <AdditionalInfoBox onSubmit={handleAugment} loading={augmenting} />

        {augmentError && (
          <div style={{
            background: '#fdf0ef', border: `1.5px solid ${RED}55`, borderRadius: 10,
            padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: RED,
          }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 18 }} />
            {augmentError}
          </div>
        )}

        {/* Toast — slides in after successful augment */}
        {toast && (
          <div style={{
            background: '#1a7a45', borderRadius: 12, padding: '14px 20px',
            marginBottom: 16, color: '#fff',
            display: 'flex', alignItems: 'flex-start', gap: 12,
            boxShadow: '0 4px 20px rgba(45,158,92,0.35)',
            animation: 'slideDown 0.3s ease',
          }}>
            <i className="ti ti-circle-check" style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                Information successfully added to the report
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {toast.map(({ label, count }) => (
                  <span key={label} style={{
                    background: 'rgba(255,255,255,0.2)', borderRadius: 20,
                    padding: '2px 10px', fontSize: 12, fontWeight: 600,
                  }}>
                    {count} item{count > 1 ? 's' : ''} → {label}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, marginTop: 8, color: 'rgba(255,255,255,0.7)' }}>
                Scroll down to see highlighted additions in the report ↓
              </div>
            </div>
            <button
              onClick={() => { setToast(null); setNewKeys(new Set()); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        )}
      </div>

      {/* ── PDF-captured report starts here ─────────────────────────────────── */}
      <div ref={innerRef} style={{ background: '#ffffff', borderRadius: 14, padding: '4px 0' }}>

      {/* ── Report header ───────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, ${BLUE} 100%)`,
        borderRadius: 14, padding: '24px 28px', color: '#fff', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>
              Executive Summary
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
              ROI Engagement Report
            </div>
            {subtitle && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{subtitle}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            <div>Anglepoint</div>
            <div>SAM Advisory</div>
            <div>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>

        {/* Overview */}
        {summary.overview && (
          <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 8 }}>
              Overview
            </div>
            <EditableOverview
              value={summary.overview}
              onChange={v => updateField('overview', v)}
            />
          </div>
        )}
      </div>

      {/* ── Highlights ──────────────────────────────────────────────────────── */}
      {hasHighlights && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {summary.highlights.map((h, i) => (
            <div key={i} style={{
              background: i === 0 ? NAVY : 'var(--blue-pale)',
              borderRadius: 10, padding: '14px 18px', flex: '1 1 160px',
              border: `1.5px solid ${i === 0 ? NAVY : BLUE + '22'}`,
            }}>
              <div style={{ fontSize: 11, color: i === 0 ? GOLD : BLUE, fontWeight: 600, marginBottom: 4 }}>{h.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: i === 0 ? '#fff' : NAVY }}>{h.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Key Metrics ─────────────────────────────────────────────────────── */}
      {hasMetrics && (
        <Section icon="ti-chart-bar" title="Key Metrics & ROI" accentColor={BLUE} hasNew={metricsHasNew}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            {summary.key_metrics.map((m, i) => (
              <MetricCard key={i} label={m.label} value={m.value} context={m.context} isNew={newKeys.has(`key_metrics:${i}`)} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Charts ──────────────────────────────────────────────────────────── */}
      {hasCharts && (
        <Section icon="ti-chart-dots" title="Visual Analytics" accentColor={TEAL}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: barData.length > 0 && donutData.length > 1 ? '1fr 1fr' : '1fr',
            gap: 16,
            marginTop: 12,
          }}>
            {barData.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: BLUE, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                  ROI Breakdown
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5a6e8c' }} />
                    <YAxis
                      tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`}
                      tick={{ fontSize: 10, fill: '#5a6e8c' }}
                      width={52}
                    />
                    <Tooltip content={<DollarTooltip />} />
                    <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                      {barData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {donutData.length > 1 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: BLUE, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Accomplishment Rate
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={80}
                      dataKey="value" paddingAngle={2}
                      label={({ name, value }) => `${value}%`}
                      labelLine={false}
                    >
                      {donutData.map((_, i) => (
                        <Cell key={i} fill={[BLUE, '#e6e8ec'][i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Legend formatter={v => <span style={{ fontSize: 12, color: NAVY }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Key Accomplishments ─────────────────────────────────────────────── */}
      {hasAccomplishments && (
        <Section icon="ti-circle-check" title="Key Accomplishments" accentColor={GREEN} hasNew={sectionHasNew('key_accomplishments')}>
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {summary.key_accomplishments.map((item, i) => (
              <EditableItem
                key={i}
                value={item}
                onChange={v => updateList('key_accomplishments', i, v)}
                bullet="✓"
                bulletColor={GREEN}
                isNew={newKeys.has(`key_accomplishments:${i}`)}
              />
            ))}
          </ul>
        </Section>
      )}

      {/* ── Recommendations ────────────────────────────────────────────────── */}
      {hasRecommendations && (
        <Section icon="ti-bulb" title="Recommendations" accentColor={GOLD} hasNew={sectionHasNew('recommendations')}>
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {summary.recommendations.map((item, i) => (
              <EditableItem
                key={i}
                value={item}
                onChange={v => updateList('recommendations', i, v)}
                bullet="→"
                bulletColor={GOLD}
                isNew={newKeys.has(`recommendations:${i}`)}
              />
            ))}
          </ul>
        </Section>
      )}

      {/* ── Risks ──────────────────────────────────────────────────────────── */}
      {(hasPrimaryRisks || hasMarketRisks) && (
        <Section icon="ti-alert-triangle" title="Risk Analysis" accentColor={RED} defaultOpen={false} hasNew={sectionHasNew('primary_risks') || sectionHasNew('market_risks')}>
          <div style={{ display: 'grid', gridTemplateColumns: hasPrimaryRisks && hasMarketRisks ? '1fr 1fr' : '1fr', gap: 16, marginTop: 12 }}>
            {hasPrimaryRisks && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: RED, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Primary Risks
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {summary.primary_risks.map((item, i) => (
                    <EditableItem
                      key={i}
                      value={item}
                      onChange={v => updateList('primary_risks', i, v)}
                      bullet="⚠"
                      bulletColor={RED}
                      isNew={newKeys.has(`primary_risks:${i}`)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {hasMarketRisks && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#c0392b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Market Risks
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {summary.market_risks.map((item, i) => (
                    <EditableItem
                      key={i}
                      value={item}
                      onChange={v => updateList('market_risks', i, v)}
                      bullet="⚡"
                      bulletColor="#e67e22"
                      isNew={newKeys.has(`market_risks:${i}`)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Additional Insights ─────────────────────────────────────────────── */}
      {hasInsights && (
        <Section icon="ti-eye" title="Additional Insights" accentColor={SLATE} defaultOpen={false} hasNew={sectionHasNew('additional_insights')}>
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {summary.additional_insights.map((item, i) => (
              <EditableItem
                key={i}
                value={item}
                onChange={v => updateList('additional_insights', i, v)}
                bullet="•"
                bulletColor={SLATE}
                isNew={newKeys.has(`additional_insights:${i}`)}
              />
            ))}
          </ul>
        </Section>
      )}

      {/* ── Next Steps ──────────────────────────────────────────────────────── */}
      {hasNextSteps && (
        <Section icon="ti-arrow-right" title="Next Steps" accentColor={TEAL} defaultOpen={false} hasNew={sectionHasNew('next_steps')}>
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {summary.next_steps.map((item, i) => (
              <EditableItem
                key={i}
                value={item}
                onChange={v => updateList('next_steps', i, v)}
                bullet={`${i + 1}.`}
                bulletColor={TEAL}
                isNew={newKeys.has(`next_steps:${i}`)}
              />
            ))}
          </ul>
        </Section>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-faint)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
        Generated by Claude AI · Anglepoint ROI Extraction Platform · {new Date().toLocaleDateString()}
      </div>

      </div> {/* end PDF-captured ref */}
    </div>
  );
}
