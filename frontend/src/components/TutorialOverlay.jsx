import React, { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'ap_tutorial_dismissed';

// Steps: targetId = id of the element to spotlight. null = centered modal.
const STEPS = [
  {
    targetId: 'journey-bar',
    position: 'bottom',
    icon: 'ti-list-check',
    title: 'This is how you extract your ROI',
    body: 'Follow these steps from top to bottom. Each one moves you closer to getting your final ROI data. You can always see where you are by looking at the bar above.',
  },
  {
    targetId: 'search-card',
    position: 'right',
    icon: 'ti-folder-search',
    title: 'Find a file by client, year, and publisher',
    body: 'Select the client, the year, and the publisher from the dropdowns, then click "Find Files." The system will show you the documents available for that combination.',
  },
  {
    targetId: 'upload-card',
    position: 'left',
    icon: 'ti-upload',
    title: 'Or upload a file from your computer',
    body: 'If you already have the document saved locally, drag and drop it here, or click to browse. Just make sure to pick the right document type, ROAR or ELP, before continuing.',
  },
  {
    targetId: null,
    position: 'center',
    icon: 'ti-git-compare',
    title: 'The system compares two extractions for you',
    body: 'After the file is processed, you will see the results from the script and the Claude AI placed side by side. If both values match, the row will be green and you are good to go. If they are different, the row will be red and you can type in the correct value.',
    preview: true,
  },
  {
    targetId: null,
    position: 'center',
    icon: 'ti-circle-check',
    title: 'Confirm everything and get your results',
    body: 'Once all fields are set, click "Confirm and Store." The platform will save the record and show you a summary of the ROI data, which you can export as a CSV file for Domo.',
  },
];

function useElementRect(targetId, step) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!targetId) { setRect(null); return; }
    const el = document.getElementById(targetId);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [targetId, step]);

  return rect;
}

export default function TutorialOverlay({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const PAD = 10;

  const rect = useElementRect(current.targetId, step);

  const handleDontShow = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onClose();
  };

  // Tooltip position relative to spotlight rect
  const tooltipStyle = (() => {
    if (!rect || current.position === 'center') {
      return {
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: current.preview ? 520 : 400,
      };
    }

    const spotTop    = rect.top    - PAD;
    const spotLeft   = rect.left   - PAD;
    const spotWidth  = rect.width  + PAD * 2;
    const spotHeight = rect.height + PAD * 2;
    const spotBottom = spotTop + spotHeight;
    const spotRight  = spotLeft + spotWidth;
    const TOOLTIP_W  = 340;
    const GAP        = 14;

    if (current.position === 'bottom') {
      return {
        position: 'fixed',
        top: spotBottom + GAP,
        left: spotLeft + spotWidth / 2 - TOOLTIP_W / 2,
        width: TOOLTIP_W,
      };
    }
    if (current.position === 'right') {
      return {
        position: 'fixed',
        top: spotTop + spotHeight / 2 - 100,
        left: spotRight + GAP,
        width: TOOLTIP_W,
      };
    }
    if (current.position === 'left') {
      return {
        position: 'fixed',
        top: spotTop + spotHeight / 2 - 100,
        left: spotLeft - TOOLTIP_W - GAP,
        width: TOOLTIP_W,
      };
    }
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: TOOLTIP_W };
  })();

  return (
    <>
      {/* Dark overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,25,65,0.62)',
        pointerEvents: 'none',
      }} />

      {/* Spotlight cutout — sits on top of overlay, pokes a hole via box-shadow */}
      {rect && (
        <div style={{
          position: 'fixed',
          zIndex: 9999,
          top:    rect.top    - PAD,
          left:   rect.left   - PAD,
          width:  rect.width  + PAD * 2,
          height: rect.height + PAD * 2,
          borderRadius: 12,
          boxShadow: '0 0 0 9999px rgba(0,25,65,0.62)',
          border: '2px solid rgba(255,255,255,0.18)',
          pointerEvents: 'none',
          transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease',
        }} />
      )}

      {/* Tooltip card */}
      <div style={{
        ...tooltipStyle,
        zIndex: 10000,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 16px 48px rgba(0,25,65,0.28)',
        overflow: 'hidden',
        transition: 'top 0.3s ease, left 0.3s ease',
      }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: '#edf0f6' }}>
          <div style={{
            height: '100%',
            width: `${((step + 1) / STEPS.length) * 100}%`,
            background: '#0052cc',
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{ padding: '20px 22px 18px' }}>
          {/* Icon + step counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(0,82,204,0.09)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className={`ti ${current.icon}`} style={{ fontSize: 18, color: '#0052cc' }} aria-hidden="true" />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              {step === 0 ? 'Start here' : `${step} of ${STEPS.length - 1}`}
            </span>
          </div>

          {/* Title */}
          <div style={{ fontSize: 16, fontWeight: 800, color: '#001941', marginBottom: 8, lineHeight: 1.3 }}>
            {current.title}
          </div>

          {/* Body */}
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: current.preview ? 14 : 18 }}>
            {current.body}
          </div>

          {/* Comparison preview mockup */}
          {current.preview && (
            <div style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 18,
              fontSize: 11,
            }}>
              {/* Header row */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
                background: '#f7f9fc', padding: '5px 10px',
                fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.05em',
                borderBottom: '1px solid #e2e8f0',
              }}>
                <span>Field</span><span>Script</span><span>Claude AI</span><span>Final</span>
              </div>
              {/* Green row */}
              {[
                { label: 'Identified Risk', a: '$1,080,000', b: '$1,080,000', match: true },
                { label: 'Realized Savings', a: '$418,000',  b: '$418,000',  match: true },
                { label: 'Acc. Cost Avoid.', a: '$320,000',  b: '$315,000',  match: false },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
                  padding: '5px 10px', alignItems: 'center',
                  background: row.match ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.06)',
                  borderLeft: `3px solid ${row.match ? '#22c55e' : '#ef4444'}`,
                  borderBottom: '1px solid #f0f3f8',
                }}>
                  <span style={{ fontWeight: 600, color: '#001941' }}>{row.label}</span>
                  <span style={{ color: '#374151', fontFamily: 'monospace' }}>{row.a}</span>
                  <span style={{ color: row.match ? '#374151' : '#b91c1c', fontWeight: row.match ? 400 : 600, fontFamily: 'monospace' }}>{row.b}</span>
                  <span>
                    {row.match
                      ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Confirmed</span>
                      : <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Enter value…</span>
                    }
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Dots */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                height: 5, borderRadius: 3,
                width: i === step ? 18 : 5,
                background: i === step ? '#0052cc' : '#d0d9ea',
                transition: 'width 0.25s ease, background 0.2s',
              }} />
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={handleDontShow}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: '#9aabca', padding: 0,
                textDecoration: 'underline', textUnderlineOffset: 2,
              }}
            >
              Don't show again
            </button>

            <div style={{ display: 'flex', gap: 7 }}>
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  style={{
                    padding: '7px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: '#f7f9fc', border: '1.5px solid #d0d9ea',
                    color: '#374151', cursor: 'pointer',
                  }}
                >
                  <i className="ti ti-arrow-left" style={{ marginRight: 3 }} /> Back
                </button>
              )}

              {isLast ? (
                <button
                  onClick={onClose}
                  style={{
                    padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                    background: '#0052cc', border: 'none', color: '#fff', cursor: 'pointer',
                  }}
                >
                  Got it! <i className="ti ti-rocket" style={{ marginLeft: 4 }} />
                </button>
              ) : (
                <button
                  onClick={() => setStep(s => s + 1)}
                  style={{
                    padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                    background: '#0052cc', border: 'none', color: '#fff', cursor: 'pointer',
                  }}
                >
                  Next <i className="ti ti-arrow-right" style={{ marginLeft: 4 }} />
                </button>
              )}

              {step === 0 && (
                <button
                  onClick={onClose}
                  style={{
                    padding: '7px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: '#f7f9fc', border: '1.5px solid #d0d9ea',
                    color: '#374151', cursor: 'pointer',
                  }}
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function shouldShowTutorial() {
  return localStorage.getItem(STORAGE_KEY) !== 'true';
}
