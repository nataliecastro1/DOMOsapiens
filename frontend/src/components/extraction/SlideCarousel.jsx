import React, { useState, useEffect, useRef } from 'react';
import { BASE } from '../../services/api';

// ─── Slide Carousel ───────────────────────────────────────────────────────────
// PPTX → embedded thumbnail (instant, zero conversion, zero extra disk).
// PDF  → PDF.js full-page navigation at device pixel ratio (sharp vectors).
export function SlideCarousel({ storedName }) {
  const isPDF = storedName.toLowerCase().endsWith('.pdf');

  // ── PPTX: simple thumbnail image ──────────────────────────────────────────
  if (!isPDF) {
    return <PptxThumbnail storedName={storedName} BASE={BASE} />;
  }

  // ── PDF: full PDF.js carousel ─────────────────────────────────────────────
  return <PdfCarousel storedName={storedName} BASE={BASE} />;
}

function PptxThumbnail({ storedName, BASE }) {
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const src = `${BASE}/uploads/${encodeURIComponent(storedName)}/thumbnail`;
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--border)', background: '#0f1f3a', marginBottom: 16 }}>
      {status === 'loading' && (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-loader-2 spinning" style={{ fontSize: 26, color: 'var(--gold)' }} />
        </div>
      )}
      {status === 'error' && (
        <div style={{ height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <i className="ti ti-eye-off" style={{ fontSize: 24, color: 'rgba(255,255,255,0.25)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No preview available</span>
        </div>
      )}
      <img
        src={src}
        alt="Document preview"
        onLoad={() => setStatus('ok')}
        onError={() => setStatus('error')}
        style={{ display: status === 'ok' ? 'block' : 'none', width: '100%', height: 'auto' }}
      />
    </div>
  );
}

function PdfCarousel({ storedName, BASE }) {
  const canvasRef       = useRef(null);
  const renderTaskRef   = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [total, setTotal]   = useState(null);
  const [index, setIndex]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
        GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
        ).toString();
        const pdfUrl = `${BASE}/uploads/${encodeURIComponent(storedName)}/preview.pdf`;
        const pdf = await getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        setPdfDoc(pdf);
        setTotal(pdf.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [storedName]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    const render = async () => {
      try {
        const page     = await pdfDoc.getPage(index + 1);
        const dpr      = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: 1 });
        const canvas   = canvasRef.current;
        if (!canvas) return;
        const scale = (canvas.parentElement?.clientWidth || 560) / viewport.width * dpr;
        const vp    = page.getViewport({ scale });
        canvas.width  = vp.width;
        canvas.height = vp.height;
        canvas.style.width  = `${vp.width / dpr}px`;
        canvas.style.height = `${vp.height / dpr}px`;
        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.warn(e);
      }
    };
    render();
  }, [pdfDoc, index]);

  if (error) return null;

  const navBtn = (onClick, disabled, icon) => (
    <button onClick={onClick} disabled={disabled} style={{
      border: 'none', background: 'none', fontSize: 20, padding: '2px 6px',
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
      color: 'var(--text)',
    }}><i className={`ti ${icon}`} /></button>
  );

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--border)', background: '#0f1f3a', marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', minHeight: 160 }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-loader-2 spinning" style={{ fontSize: 26, color: 'var(--gold)' }} />
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: loading ? 'none' : 'block', width: '100%' }} />
        {total && !loading && (
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#fff', fontWeight: 700 }}>
            {index + 1} / {total}
          </div>
        )}
      </div>
      {total > 1 && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {navBtn(() => setIndex(i => Math.max(0, i - 1)), index === 0, 'ti-chevron-left')}
          <div style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: Math.min(total, 10) }).map((_, i) => (
              <button key={i} onClick={() => setIndex(i)} style={{
                width: index === i ? 18 : 6, height: 6, borderRadius: 3,
                border: 'none', padding: 0, cursor: 'pointer',
                background: index === i ? 'var(--gold)' : 'rgba(255,255,255,0.25)',
                transition: 'width 0.2s, background 0.2s',
              }} />
            ))}
            {total > 10 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>…</span>}
          </div>
          {navBtn(() => setIndex(i => Math.min(total - 1, i + 1)), index === total - 1, 'ti-chevron-right')}
        </div>
      )}
    </div>
  );
}

// ─── Slide stack: all PDF pages rendered top-to-bottom ───────────────────────
export const SlideStack = React.forwardRef(function SlideStack({ storedName }, ref) {
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);
  const [highlighted, setHighlighted] = useState(null);
  const slideRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/uploads/${encodeURIComponent(storedName)}/slides`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ count }) => { if (!cancelled) { setTotal(count); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [storedName]);

  React.useImperativeHandle(ref, () => ({
    jumpTo(index) {
      const el = slideRefs.current[index];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlighted(index);
        setTimeout(() => setHighlighted(null), 2000);
      }
    }
  }), []);

  if (error) return (
    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
      <i className="ti ti-file-off" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
      Preview not available for this file
    </div>
  );
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <i className="ti ti-loader-2 spinning" style={{ fontSize: 28, color: 'var(--gold)' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          ref={el => slideRefs.current[i] = el}
          style={{
            position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#eee',
            transition: 'box-shadow 0.3s',
            boxShadow: highlighted === i ? '0 0 0 3px var(--gold)' : 'none',
          }}
        >
          <img
            src={`${BASE}/uploads/${encodeURIComponent(storedName)}/slides/${i}.png`}
            alt={`Slide ${i + 1}`}
            style={{ display: 'block', width: '100%', height: 'auto' }}
            loading="lazy"
          />
          <div style={{
            position: 'absolute', bottom: 6, right: 8,
            background: highlighted === i ? 'var(--gold)' : 'rgba(0,0,0,0.55)',
            borderRadius: 4, padding: '2px 7px', fontSize: 10, color: '#fff', fontWeight: 700,
            transition: 'background 0.3s',
          }}>
            {i + 1} / {total}
          </div>
        </div>
      ))}
    </div>
  );
});
