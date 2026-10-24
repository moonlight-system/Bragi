import "./Mobile.css";
import { useState, useEffect, useRef } from "react";
import { useMobileNav } from "../../useMobileNav";
import type { Playlist, Song } from "../../types_and_functions";
import type { Player } from "../../usePlayer";
import { MobilePlaylistsScreen, MobileSongsScreen, MobilePlayerScreen } from "./MobileScreens";
import { MobileSettings } from "./MobileSettings";
import { MiniPlayer } from "./MiniPlayer";
import { ActionSheet, TextPrompt } from "./Sheets";
import type { SheetAction } from "./Sheets";
import { pickSongs } from "../../importSongs";
import { pickCover } from "../../pickCover";
import { ChevronLeft, Plus, Settings } from "lucide-react";
import { Mp3Picker } from "./Mp3Picker";
import { ensureAudioPermission, importDeviceMp3, hasNativeAudio } from "../../nativeAudio";
import type { DeviceMp3 } from "../../nativeAudio";
import { UpdateBanner } from "./UpdateBanner";

export type MobileActions = {
  createPlaylist: (name: string) => void;
  deletePlaylist: (playlist: Playlist) => void;
  renamePlaylist: (playlist: Playlist, newName: string) => void;
  movePlaylist: (playlist: Playlist, direction: "up" | "down") => void;
  setCover: (playlist: Playlist, cover: string | null) => void;
  addSongs: (newSongs: Song[], targetPlaylist: Playlist) => void;
  renameSong: (song: Song, newName: string) => void;
  renameArtist: (song: Song, newArtist: string) => void;
  removeSong: (song: Song, playlist: Playlist) => void;
  moveSong: (song: Song, playlist: Playlist, direction: "up" | "down") => void;
  copySong: (song: Song, targetPlaylist: Playlist) => void;
};

// at most one dialog is open at a time
type Modal =
  | { kind: "playlistMenu"; playlist: Playlist }
  | { kind: "songMenu"; song: Song }
  | { kind: "copyPicker"; song: Song }
  | { kind: "prompt"; title: string; initial?: string; onSubmit: (value: string) => void }
  | { kind: "mp3Picker"; playlist: Playlist }
  | null;

function MobileShell({ playlists, songs, player, onColorsChange, actions, backOnRight, onBackOnRightChange, font, onFontChange, fontSize, onFontSizeChange }: {
  playlists: Playlist[];
  songs: Song[];
  player: Player;
  onColorsChange: (changes: Record<string, string>) => void;
  actions: MobileActions;
  backOnRight: boolean;
  onBackOnRightChange: (value: boolean) => void;
  font: string;
  onFontChange: (name: string) => void;
  fontSize: string;
  onFontSizeChange: (name: string) => void;
}) {
  const nav = useMobileNav();
  const [viewedPlaylistId, setViewedPlaylistId] = useState<string | null>(null);
  const viewedPlaylist = playlists.find(p => p.id === viewedPlaylistId) ?? null;

  const [modal, setModalRaw] = useState<Modal>(null);
  const modalRef = useRef<Modal>(null);   // always-current copy, read right after an action runs

  // every existing setModal({...}) call now also opens the history entry
  function setModal(m: Modal) {
    modalRef.current = m;
    setModalRaw(m);
    if (m) nav.openModal();
  }

  // dismiss from the screen (overlay tap, Cancel, OK): pop the dialog's history entry
  function close() {
    modalRef.current = null;
    setModalRaw(null);
    nav.closeModal();
  }

  // run a sheet action; if it didn't open another dialog, pop the history entry
  function runAction(fn: () => void) {
    modalRef.current = null;
    setModalRaw(null);
    fn();
    if (modalRef.current === null) nav.closeModal();
  }

  const sheetActions = (list: SheetAction[]): SheetAction[] =>
    list.map(a => ({ ...a, onPick: () => runAction(a.onPick) }));

  // the system back button popped the entry: make sure the dialog is gone
  useEffect(() => {
    if (!nav.modalOpen) {
      modalRef.current = null;
      setModalRaw(null);
    }
  }, [nav.modalOpen]);

  const [importing, setImporting] = useState(false);

  const showFab = nav.screen === "playlists" || (nav.screen === "songs" && viewedPlaylist !== null);

  function onFab() {
    if (nav.screen === "playlists") {
      setModal({ kind: "prompt", title: "New playlist", onSubmit: actions.createPlaylist });
    } else if (nav.screen === "songs" && viewedPlaylist) {
      importInto(viewedPlaylist);
    }
  }

  async function importInto(playlist: Playlist) {
    // preferred: Bragi's own list of mp3s, if the native bridge exists and the permission is granted
    if (hasNativeAudio() && (await ensureAudioPermission())) {
      setModal({ kind: "mp3Picker", playlist });
      return;
    }
    // fallback: the system file picker
    setImporting(true);
    try {
      await pickSongs((song) => actions.addSongs([song], playlist));
    } catch (err) {
      console.error("import failed:", err);
    } finally {
      setImporting(false);
    }
  }

  async function importDevice(playlist: Playlist, items: DeviceMp3[]) {
    setImporting(true);
    try {
      for (const item of items) {
        const song = await importDeviceMp3(item);
        if (song) actions.addSongs([song], playlist);
        await new Promise(r => setTimeout(r));   // the copy blocks briefly: let the UI breathe
      }
    } catch (err) {
      console.error("import failed:", err);
    } finally {
      setImporting(false);
    }
  }

  async function chooseCover(playlist: Playlist) {
    try {
      const cover = await pickCover();
      if (cover) actions.setCover(playlist, cover);
    } catch (err) {
      console.error("cover failed:", err);
    }
  }

  function playlistMenuActions(p: Playlist): SheetAction[] {
    const index = playlists.findIndex(x => x.id === p.id);
    const list: SheetAction[] = [
      { label: "Rename", onPick: () => setModal({
          kind: "prompt", title: "Rename playlist", initial: p.name,
          onSubmit: (name) => actions.renamePlaylist(p, name),
      }) },
      { label: p.cover ? "Change cover image" : "Set cover image", onPick: () => chooseCover(p) },
    ];
    if (index > 0) list.push({ label: "Move up", onPick: () => actions.movePlaylist(p, "up") });
    if (index < playlists.length - 1) list.push({ label: "Move down", onPick: () => actions.movePlaylist(p, "down") });
    list.push({ label: "Delete", danger: true, onPick: () => actions.deletePlaylist(p) });
    return list;
  }

  function songMenuActions(s: Song): SheetAction[] {
    if (!viewedPlaylist) return [];
    const index = viewedPlaylist.songIds.indexOf(s.id);
    const last = viewedPlaylist.songIds.length - 1;
    const list: SheetAction[] = [
      { label: "Rename song", onPick: () => setModal({
          kind: "prompt", title: "Rename song", initial: s.name,
          onSubmit: (name) => actions.renameSong(s, name),
      }) },
      { label: "Edit artist", onPick: () => setModal({
          kind: "prompt", title: "Edit artist", initial: s.artist,
          onSubmit: (artist) => actions.renameArtist(s, artist),
      }) },
    ];
    if (index > 0) list.push({ label: "Move up", onPick: () => actions.moveSong(s, viewedPlaylist, "up") });
    if (index < last) list.push({ label: "Move down", onPick: () => actions.moveSong(s, viewedPlaylist, "down") });
    if (playlists.length > 1) list.push({ label: "Add to another playlist", onPick: () => setModal({ kind: "copyPicker", song: s }) });
    list.push({ label: "Remove from playlist", danger: true, onPick: () => actions.removeSong(s, viewedPlaylist) });
    return list;
  }

  const title =
    nav.screen === "playlists" ? "Bragi" :
    nav.screen === "songs" ? (viewedPlaylist?.name ?? "Songs") :
    nav.screen === "player" ? "Now playing" :
    "Settings";

  const showBackButton = nav.screen === "songs" || nav.screen === "player" || nav.screen === "settings";
  // the gear is hidden on the player and on settings itself
  const showSettingsButton = nav.screen === "playlists" || nav.screen === "songs";

  return (
    <div className="m_shell">
        <header className="m_topbar">
          {showBackButton && <button className="app_button m_back" onClick={nav.back}>
              <ChevronLeft size={28} />
            </button>}
          <div className="m_title">{title}</div>
          {showSettingsButton && (
            <button className="app_button m_header_btn" onClick={() => nav.push("settings")} aria-label="Settings">
              <Settings size={22} />
            </button>
          )}
        </header>

        <UpdateBanner />

        <div className="m_content_wrap">
          <main className={`m_content ${showFab ? "m_content_fab" : ""}`}>
            {nav.screen === "playlists" && (
              <MobilePlaylistsScreen
                playlists={playlists}
                onOpen={(p) => { setViewedPlaylistId(p.id); nav.push("songs"); }}
                onMenu={(p) => setModal({ kind: "playlistMenu", playlist: p })}
              />
            )}
            {nav.screen === "songs" && viewedPlaylist && (
              <MobileSongsScreen
                playlist={viewedPlaylist}
                songs={songs}
                playingSongId={player.currentSong?.id ?? null}
                onPlay={(song) => { player.playSong(song, viewedPlaylist); nav.push("player"); }}
                onMenu={(song) => setModal({ kind: "songMenu", song })}
              />
            )}
            {nav.screen === "player" && <MobilePlayerScreen player={player} />}
            {nav.screen === "settings" && (
              <MobileSettings onColorsChange={onColorsChange} backOnRight={backOnRight} onBackOnRightChange={onBackOnRightChange} font={font} onFontChange={onFontChange} fontSize={fontSize} onFontSizeChange={onFontSizeChange} />
            )}
          </main>
  
          {showFab && (
            <button className="m_fab" onClick={onFab} aria-label="Add">
              <Plus size={30} strokeWidth={4} />
            </button>
          )}
          {nav.screen === "songs" && (
            <button
              className={`m_fab ${backOnRight ? "m_fab_beside" : "m_fab_left"}`}
              onClick={nav.back}
              aria-label="Back to playlists"
            ><ChevronLeft size={30} strokeWidth={4} /></button>
          )}

          {importing && <div className="m_importing">Importing…</div>}
        </div>
  
        {nav.screen !== "player" && (
          <MiniPlayer player={player} onOpen={() => nav.push("player")} />
        )}
  
        {modal?.kind === "playlistMenu" && (
          <ActionSheet title={modal.playlist.name} actions={sheetActions(playlistMenuActions(modal.playlist))} onClose={close} />
        )}
        {modal?.kind === "songMenu" && (
          <ActionSheet title={modal.song.name} actions={sheetActions(songMenuActions(modal.song))} onClose={close} />
        )}
        {modal?.kind === "copyPicker" && viewedPlaylist && (
          <ActionSheet
            title={`Add "${modal.song.name}" to:`}
            actions={sheetActions(playlists
              .filter(p => p.id !== viewedPlaylist.id)
              .map(p => ({ label: p.name, onPick: () => actions.copySong(modal.song, p) })))}
            onClose={close}
          />
        )}
        {modal?.kind === "prompt" && (
          <TextPrompt title={modal.title} initial={modal.initial} onSubmit={modal.onSubmit} onClose={close} />
        )}
        {modal?.kind === "mp3Picker" && (
        <Mp3Picker
          onClose={close}
          onImport={(items) => { const target = modal.playlist; close(); importDevice(target, items); }}
        />
      )}
    </div>
  );
}

export { MobileShell };