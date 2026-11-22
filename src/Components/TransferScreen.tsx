import "./TransferScreen.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import type { Playlist, Song } from "../types_and_functions";
import { isAndroid } from "../types_and_functions";
import {
  buildManifest, connect, importPackage, incomingSource, pushPackage, readManifest, remoteSource,
  selectAllOf, selectEverything, selKey,
} from "../transfer";
import type { ImportResult, ImportStats, Manifest, Remote, Selection, Source } from "../transfer";

type Group = { id: string; name: string; songs: { id: string; name: string; artist: string }[] };
type Message = { kind: "ok" | "error"; lines: string[] };

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function importLines(s: ImportStats): string[] {
  const lines = [`Added ${plural(s.added, "song")}. Playlists created or updated: ${s.playlists}.`];
  if (s.alreadyHere > 0) lines.push(`${plural(s.alreadyHere, "song")} ${s.alreadyHere === 1 ? "was" : "were"} already in your library (same ID): not copied again.`);
  if (s.duplicates > 0) lines.push(`${plural(s.duplicates, "song")} ${s.duplicates === 1 ? "was" : "were"} identical to an existing one (same title, artist and file): the existing one is used.`);
  if (s.keptSeparate > 0) lines.push(`${plural(s.keptSeparate, "song")} share${s.keptSeparate === 1 ? "s" : ""} a title and artist with an existing song but ${s.keptSeparate === 1 ? "is a different file" : "are different files"}: both kept.`);
  if (s.missing > 0) lines.push(`${plural(s.missing, "file")} ${s.missing === 1 ? "was" : "were"} missing from the transfer and skipped.`);
  return lines;
}

function MessageBox({ message }: { message: Message | null }) {
  if (!message) return null;
  return (
    <div className={`tr_message ${message.kind === "error" ? "tr_message_error" : ""}`}>
      {message.lines.map((line, i) => <div key={i}>{line}</div>)}
    </div>
  );
}

// playlists with a checkbox each (all their songs), expandable to pick single songs
function SelectionList({ groups, selected, onChange, disabled }: {
  groups: Group[];
  selected: Selection;
  onChange: (next: Selection) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const total = groups.reduce((n, g) => n + g.songs.length, 0);

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGroup(g: Group) {
    const next = new Set(selected);
    const all = g.songs.every(s => next.has(selKey(g.id, s.id)));
    for (const s of g.songs) {
      if (all) next.delete(selKey(g.id, s.id)); else next.add(selKey(g.id, s.id));
    }
    onChange(next);
  }

  function toggleSong(g: Group, songId: string) {
    const next = new Set(selected);
    const key = selKey(g.id, songId);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  }

  function selectAll() {
    const next: Selection = new Set();
    for (const g of groups) for (const s of g.songs) next.add(selKey(g.id, s.id));
    onChange(next);
  }

  return (
    <div className="tr_list">
      <div className="tr_list_tools">
        <span className="tr_count">{selected.size} of {total} selected</span>
        <button className="app_button tr_small" disabled={disabled} onClick={selectAll}>Select all</button>
        <button className="app_button tr_small" disabled={disabled} onClick={() => onChange(new Set())}>Select none</button>
      </div>

      {groups.map(g => {
        const count = g.songs.filter(s => selected.has(selKey(g.id, s.id))).length;
        const all = count === g.songs.length && count > 0;
        const partial = count > 0 && !all;
        const isOpen = expanded.has(g.id);
        return (
          <div key={g.id} className="tr_group">
            <div className="tr_group_row">
              <input
                type="checkbox"
                className="tr_check"
                checked={all}
                ref={(el) => { if (el) el.indeterminate = partial; }}
                disabled={disabled}
                onChange={() => toggleGroup(g)}
              />
              <span className="tr_group_name" onClick={() => toggleExpanded(g.id)}>{g.name}</span>
              <span className="tr_group_count">{count}/{g.songs.length}</span>
              <button
                className="tr_chevron"
                aria-label={isOpen ? "Hide songs" : "Show songs"}
                onClick={() => toggleExpanded(g.id)}
              >
                {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>
            </div>

            {isOpen && g.songs.map(s => (
              <label key={s.id} className="tr_song_row">
                <input
                  type="checkbox"
                  className="tr_check"
                  checked={selected.has(selKey(g.id, s.id))}
                  disabled={disabled}
                  onChange={() => toggleSong(g, s.id)}
                />
                <span className="tr_song_name">{s.name}</span>
                <span className="tr_song_artist">{s.artist}</span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function randomPin() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

// ---------------- desktop: waits for the phone ----------------

function TransferHost({ playlists, songs, onImport, onBack }: {
  playlists: Playlist[];
  songs: Song[];
  onImport: (result: ImportResult) => void;
  onBack: () => void;
}) {
  const [info, setInfo] = useState<{ address: string; pin: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  // the listener is registered once, so it reads the latest values through refs
  const libraryRef = useRef({ playlists, songs });
  libraryRef.current = { playlists, songs };
  const onImportRef = useRef(onImport);
  onImportRef.current = onImport;
  const receivingRef = useRef(false);

  // the phone has uploaded everything: import it
  async function receive() {
    if (receivingRef.current) return;
    receivingRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const source = await incomingSource();
      const manifest = await readManifest(source);
      const result = await importPackage(
        source, manifest, selectAllOf(manifest), libraryRef.current.songs,
        (done, total) => setProgress({ done, total }),
      );
      onImportRef.current(result);
      setMessage({ kind: "ok", lines: ["Received from the phone.", ...importLines(result.stats)] });
      await invoke("transfer_clear_incoming");
    } catch (err) {
      setMessage({ kind: "error", lines: [errorText(err)] });
    } finally {
      receivingRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  }

  // the server runs only while this page is open
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen("transfer-received", () => { void receive(); });
        if (cancelled) { unlisten(); return; }
        const pin = randomPin();
        const { playlists: lists, songs: all } = libraryRef.current;
        const manifest = buildManifest(lists, all, selectEverything(lists));
        const address = await invoke<string>("transfer_start", { pin, manifest: JSON.stringify(manifest) });
        if (!cancelled) setInfo({ address, pin });
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
      void invoke("transfer_stop");
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onBack();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, busy]);

  return (
    <div className="settings_page">
      <header className="settings_header">
        <button
          className="settings_back_button"
          tabIndex={-1}
          title="Back (Esc)"
          aria-label="Back"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBack}
        >
          <ArrowLeft size={28} strokeWidth={3} />
        </button>
        <h1 className="settings_title">Transfer</h1>
        <span className="settings_hint">Esc to go back</span>
      </header>

      <div className="settings_body">
        <div className="settings_column">
          <section className="settings_card">
            <div className="tr_body">
              {error && <MessageBox message={{ kind: "error", lines: [error] }} />}

              {!error && !info && <p className="tr_note">Starting…</p>}

              {info && (
                <>
                  <p className="tr_note">On your phone, open Settings, then Transfer, and enter:</p>
                  <div className="tr_pair">
                    <div className="tr_pair_item">
                      <span className="tr_pair_label">Address</span>
                      <span className="tr_pair_value">{info.address}</span>
                    </div>
                    <div className="tr_pair_item">
                      <span className="tr_pair_label">Code</span>
                      <span className="tr_pair_value">{info.pin}</span>
                    </div>
                  </div>
                  <p className="tr_note">
                    From the phone you can get songs and playlists from this computer, or send some to it.
                    Both devices must be on the same Wi-Fi network (a phone connected by USB tethering also works).
                    The first time, Windows may ask whether Bragi can use the network: allow it on private networks.
                    Leaving this page stops sharing.
                  </p>
                  {!busy && !message && <p className="tr_note">Waiting for the phone…</p>}
                </>
              )}

              {busy && <p className="tr_note">Importing… {progress ? `${progress.done}/${progress.total}` : ""}</p>}
              <MessageBox message={message} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------- phone: connects to the computer ----------------

function TransferClient({ playlists, songs, onImport }: {
  playlists: Playlist[];
  songs: Song[];
  onImport: (result: ImportResult) => void;
}) {
  const [address, setAddress] = useState(() => {
    try { return localStorage.getItem("bragi-transfer-address") ?? ""; } catch { return ""; }
  });
  const [code, setCode] = useState("");
  const [remote, setRemote] = useState<Remote | null>(null);
  const [mode, setMode] = useState<"menu" | "get" | "send">("menu");
  const [incoming, setIncoming] = useState<{ source: Source; manifest: Manifest } | null>(null);
  const [recvSel, setRecvSel] = useState<Selection>(new Set());
  const [sendSel, setSendSel] = useState<Selection>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const sendGroups: Group[] = useMemo(() => {
    const byId = new Map(songs.map(s => [s.id, s]));
    return playlists
      .map(p => ({ id: p.id, name: p.name, songs: p.songIds.map(id => byId.get(id)).filter((s): s is Song => !!s) }))
      .filter(g => g.songs.length > 0);
  }, [playlists, songs]);

  const receiveGroups: Group[] = useMemo(() => {
    if (!incoming) return [];
    const byId = new Map(incoming.manifest.songs.map(s => [s.id, s]));
    return incoming.manifest.playlists.map(p => ({
      id: p.id,
      name: p.name,
      songs: p.songIds.map(id => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s),
    }));
  }, [incoming]);

  async function run(label: string, job: () => Promise<string[]>): Promise<boolean> {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ kind: "ok", lines: await job() });
      return true;
    } catch (err) {
      setMessage({ kind: "error", lines: [errorText(err)] });
      return false;
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function doConnect() {
    setBusy("Connecting");
    setMessage(null);
    try {
      const r = await connect(address, code);
      try { localStorage.setItem("bragi-transfer-address", r.address); } catch {}
      setRemote(r);
      setMode("menu");
    } catch (err) {
      setMessage({ kind: "error", lines: [errorText(err)] });
    } finally {
      setBusy(null);
    }
  }

  function disconnect() {
    setRemote(null);
    setMode("menu");
    setIncoming(null);
    setMessage(null);
    setCode("");
  }

  async function openGet() {
    if (!remote) return;
    setMode("get");
    setMessage(null);
    setBusy("Loading");
    try {
      const source = remoteSource(remote);
      const manifest = await readManifest(source);
      if (manifest.songs.length === 0) throw new Error("The computer has no songs to send yet.");
      setIncoming({ source, manifest });
      setRecvSel(selectAllOf(manifest));
    } catch (err) {
      setMessage({ kind: "error", lines: [errorText(err)] });
      setMode("menu");
    } finally {
      setBusy(null);
    }
  }

  async function doImport() {
    if (!incoming || recvSel.size === 0) return;
    const ok = await run("Importing", async () => {
      const result = await importPackage(incoming.source, incoming.manifest, recvSel, songs, (done, total) => setProgress({ done, total }));
      onImport(result);
      return importLines(result.stats);
    });
    if (ok) { setIncoming(null); setMode("menu"); }
  }

  async function doSend() {
    if (!remote) return;
    const manifest = buildManifest(playlists, songs, sendSel);
    if (manifest.songs.length === 0) return;
    const ok = await run("Sending", async () => {
      const r = await pushPackage(remote, manifest, (done, total) => setProgress({ done, total }));
      const lines = [`Sent ${plural(r.songs, "song")} in ${plural(r.playlists, "playlist")}. The computer is importing them now.`];
      if (r.missing > 0) lines.push(`${plural(r.missing, "song file")} could not be found and ${r.missing === 1 ? "was" : "were"} left out.`);
      return lines;
    });
    if (ok) { setSendSel(new Set()); setMode("menu"); }
  }

  const progressText = busy ? `${busy}… ${progress ? `${progress.done}/${progress.total}` : ""}` : "";

  return (
    <div className="tr_mobile">
      <div className="tr_body">
        {!remote && (
          <>
            <p className="tr_note">
              On the computer, open Transfer in Bragi (the arrows icon, or the t key). It shows an address and a code. Both devices must be on the same Wi-Fi.
            </p>
            <label className="tr_field">
              <span className="tr_field_label">Address</span>
              <input
                className="app_input tr_input"
                type="text"
                placeholder="192.168.1.20:47831"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={address}
                disabled={!!busy}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <label className="tr_field">
              <span className="tr_field_label">Code</span>
              <input
                className="app_input tr_input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digits"
                value={code}
                disabled={!!busy}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") void doConnect(); }}
              />
            </label>
            <button className="app_button tr_primary" disabled={!!busy || !address.trim() || code.length !== 6} onClick={doConnect}>
              {busy ?? "Connect"}
            </button>
          </>
        )}

        {remote && (
          <>
            <div className="tr_connected">
              <span>Connected to {remote.address}</span>
              <button className="app_button tr_small" disabled={!!busy} onClick={disconnect}>Disconnect</button>
            </div>

            {mode === "menu" && (
              <div className="tr_choices">
                <button className="app_button tr_primary" disabled={!!busy} onClick={openGet}>Get from computer</button>
                <button className="app_button tr_primary" disabled={!!busy} onClick={() => { setMode("send"); setMessage(null); }}>Send to computer</button>
              </div>
            )}

            {mode === "get" && (
              <>
                {incoming && (
                  <>
                    <p className="tr_note">
                      {incoming.manifest.songs.length} songs in {incoming.manifest.playlists.length} playlists on the computer. Untick what you don't want.
                    </p>
                    <SelectionList groups={receiveGroups} selected={recvSel} onChange={setRecvSel} disabled={!!busy} />
                    <div className="tr_actions">
                      <button className="app_button tr_primary" disabled={!!busy || recvSel.size === 0} onClick={doImport}>
                        {busy ?? "Import selected"}
                      </button>
                      <button className="app_button" disabled={!!busy} onClick={() => { setIncoming(null); setMode("menu"); }}>Cancel</button>
                    </div>
                  </>
                )}
              </>
            )}

            {mode === "send" && (
              <>
                <p className="tr_note">Pick playlists, or open one to pick single songs.</p>
                {sendGroups.length === 0
                  ? <p className="tr_note">There is nothing to send yet.</p>
                  : <SelectionList groups={sendGroups} selected={sendSel} onChange={setSendSel} disabled={!!busy} />}
                <div className="tr_actions">
                  <button className="app_button tr_primary" disabled={!!busy || sendSel.size === 0} onClick={doSend}>
                    {busy ?? "Send"}
                  </button>
                  <button className="app_button" disabled={!!busy} onClick={() => setMode("menu")}>Cancel</button>
                </div>
              </>
            )}
          </>
        )}

        {busy && remote && <p className="tr_note">{progressText}</p>}
        <MessageBox message={message} />
      </div>
    </div>
  );
}

function TransferScreen({ playlists, songs, onImport, onBack }: {
  playlists: Playlist[];
  songs: Song[];
  onImport: (result: ImportResult) => void;
  onBack?: () => void;     // given on desktop: the screen then draws its own header
}) {
  if (isAndroid) return <TransferClient playlists={playlists} songs={songs} onImport={onImport} />;
  return <TransferHost playlists={playlists} songs={songs} onImport={onImport} onBack={onBack ?? (() => {})} />;
}

export { TransferScreen };