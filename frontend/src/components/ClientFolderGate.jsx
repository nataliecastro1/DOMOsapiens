import React, { useState } from 'react';

// Scan a picked folder for client names. Two shapes are supported:
//   1. A parent that holds the region folders ("Client Delivery - A-C", "… D-G"):
//      we step into every "Client Delivery*" subfolder and collect its children.
//   2. A single region folder itself: its immediate subfolders are the clients.
// Only directory NAMES are read — no files are opened, so OneDrive online-only
// folders work and nothing is downloaded. Returns the sorted client names plus
// a name -> directory handle map (kept for Phase 2: jumping straight to a
// client's folder on the Files step).
// Folders that are clearly not clients (deliverable/utility/system folders),
// so things like "04 - DELIVERABLES" don't show up in the client list.
const NON_CLIENT = /^\.|^_|deliverabl|^(shared documents|documents|forms|general|archive|templates?)$/i;

async function scanClients(rootHandle) {
  const handles = new Map();
  const regionDirs = [];

  for await (const entry of rootHandle.values()) {
    if (entry.kind === 'directory' && /client\s*delivery/i.test(entry.name)) {
      regionDirs.push(entry);
    }
  }

  const sources = regionDirs.length ? regionDirs : [rootHandle];
  for (const source of sources) {
    for await (const entry of source.values()) {
      if (entry.kind === 'directory'
          && !/client\s*delivery/i.test(entry.name)
          && !NON_CLIENT.test(entry.name)) {
        handles.set(entry.name, entry);
      }
    }
  }

  const clients = [...handles.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
  return { clients, handles };
}

// Post-login modal: offers to load the real client list from a local folder.
// The OS folder chooser can only open from a user gesture, so loading happens
// when the SME clicks "Choose folder"; "Skip for now" dismisses with no load.
export default function ClientFolderGate({ onLoaded, onSkip }) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const handleChoose = async () => {
    setError(null);
    let root;
    try {
      root = await window.showDirectoryPicker();
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // dismissed picker — no-op
      setError(err.message || 'Could not open the folder picker.');
      return;
    }
    setBusy(true);
    try {
      const { clients, handles } = await scanClients(root);
      onLoaded({ clients, handles, rootName: root.name });
    } catch (err) {
      setError(err.message || 'Could not read that folder.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box client-gate">
        <i className="ti ti-folders client-gate-icon" aria-hidden="true" />
        <div className="client-gate-title">Load your client list</div>
        <p className="client-gate-text">
          Point DOMOsapiens at your <strong>Client Delivery</strong> folder — or the parent
          that holds the A&ndash;C, D&ndash;G&hellip; folders — and it will fill the client
          dropdown from your real folders. Only folder names are read: nothing is opened or
          uploaded, and your files stay on your computer.
        </p>

        {!supported && (
          <div className="client-gate-warn">
            <i className="ti ti-browser-x" aria-hidden="true" />
            This needs Chrome or Microsoft Edge. You can skip and use the built-in list.
          </div>
        )}

        {error && (
          <div className="client-gate-warn">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="modal-btn-row">
          <button className="btn ghost" onClick={onSkip} disabled={busy}>
            Skip for now
          </button>
          <button className="btn primary" onClick={handleChoose} disabled={busy || !supported}>
            <i className="ti ti-folder-open" aria-hidden="true" />
            {busy ? ' Scanning…' : ' Choose folder'}
          </button>
        </div>
      </div>
    </div>
  );
}
