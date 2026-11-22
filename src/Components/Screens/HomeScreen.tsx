// HomeScreen.tsx
import "./HomeScreen.css";
import { useEffect, useRef, useState } from "react";
import { PlaylistListItem } from "../Playlist_List_Item";
import { CursorList } from "../CursorList";
import type { Playlist, Song } from '../../types_and_functions';
import { open } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { getBragiDir } from '../../storage';
import type { Player } from '../../usePlayer';
import { ProgressBar } from "../ProgressBar";
import { Visualizer } from "../Visualizer";
import { EditableLabel } from "../EditableLabel";
import type { ItemEditor, CursorListHandle, ExtraAction } from "../CursorList";
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { newId, audioExt, audioMime, stripAudioExt, AUDIO_EXTENSIONS } from '../../types_and_functions';
import { readTags, saveCover, pickSongCover } from '../../importSongs';
import { pickCover } from '../../pickCover';
import { SongCover } from "../Cover";
import { ArrowDownAZ, Plus, Settings } from "lucide-react";
import { VolumeSlider } from "../VolumeSlider";
import { PlayerControls } from "../PlayerControls";

function SongListItem({ song, playing, editor }: {
  song: Song;
  playing: boolean;
  editor?: ItemEditor;
}) {
  return (
    <div className="item_row">
      <SongCover file={song.cover} className="cover_row" />
      <div className="item_text">
        <div style={{ color: playing ? "var(--songs-accent-color)" : "var(--text-color)" }}>
          <EditableLabel value={song.name} field="name" editor={editor} />
        </div>
        <div className="song_artist_name" style={{ color: "grey" }}>
          <EditableLabel value={song.artist} field="artist" editor={editor} />
        </div>
      </div>
    </div>
  );
}

function HomeScreen({
  playlists,
  viewedPlaylistId,
  onViewedPlaylistIdChange,
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onMovePlaylist,
  onSetPlaylistCover,
  songs,
  onSwitchToSettingsScreen,
  onAddSongs,
  onRenameSong,
  onRenameArtist,
  onRemoveSong,
  onMoveSong,
  onCopySong,
  onSetSongCover,
  player,
}: {
  playlists: Playlist[];
  viewedPlaylistId: string | null;
  onViewedPlaylistIdChange: (id: string | null) => void;
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (playlist: Playlist) => void;
  onRenamePlaylist: (playlist: Playlist, newName: string) => void;
  onMovePlaylist: (playlist: Playlist, direction: "up" | "down") => void;
  onSetPlaylistCover: (playlist: Playlist, cover: string | null) => void;
  songs: Song[];
  onSwitchToSettingsScreen: () => void;
  onAddSongs: (newSongs: Song[], targetPlaylist: Playlist) => void;
  onRenameSong: (song: Song, newName: string) => void;
  onRenameArtist: (song: Song, newArtist: string) => void;
  onRemoveSong: (song: Song, playlist: Playlist) => void;
  onMoveSong: (song: Song, playlist: Playlist, direction: "up" | "down") => void;
  onCopySong: (song: Song, targetPlaylist: Playlist) => void;
  onSetSongCover: (song: Song, cover: string) => void;
  player: Player;
}) {

  const [playlistsMode, setPlaylistsMode] = useState<"idle" | "creating" | "renaming">("idle");
  const [songsMode, setSongsMode] = useState<"idle" | "creating" | "renaming">("idle");
  const [query, setQuery] = useState("");
  const [sortByArtist, setSortByArtist] = useState(false);
  const [copyingSong, setCopyingSong] = useState<Song | null>(null);
  const playlistListRef = useRef<CursorListHandle>(null);

  const viewedPlaylist = playlists.find(p => p.id === viewedPlaylistId) ?? null;
  const isTyping = playlistsMode !== "idle" || songsMode !== "idle";
  const playingSongId = player.currentSong?.id ?? null;
  const otherPlaylists = playlists.filter(p => p.id !== viewedPlaylistId);

  // the viewed playlist's songs, in playlist order or sorted by artist (the order the queue follows)
  const playlistSongs: Song[] = viewedPlaylist
    ? viewedPlaylist.songIds
        .map(id => songs.find(s => s.id === id))
        .filter((s): s is Song => s !== undefined)
    : [];
  const orderedSongs = sortByArtist
    ? [...playlistSongs].sort((a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }))
    : playlistSongs;
  const q = query.trim().toLowerCase();
  const visibleSongs = q
    ? orderedSongs.filter(s => s.name.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
    : orderedSongs;
  const canReorder = !sortByArtist && q === "";

  useEffect(() => {
    if (viewedPlaylistId && !playlists.some(p => p.id === viewedPlaylistId)) {
      onViewedPlaylistIdChange(null);
    }
  }, [playlists, viewedPlaylistId]);

  function activatePlaylist(playlist: Playlist) {
    onViewedPlaylistIdChange(playlist.id);
    setQuery("");
  }

  async function importSongs() {
    if (!viewedPlaylist) return;

    const selected = await open({
      multiple: true,
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    });

    if (!selected) return; // user cancelled
    const paths = Array.isArray(selected) ? selected : [selected];

    const bragiDir = await getBragiDir();
    const newSongs: Song[] = [];
    for (const sourcePath of paths) {
      const id = newId();
      const fileName = sourcePath.split(/[\\/]/).pop() ?? 'Unknown';
      const ext = audioExt(fileName);
      const bytes = await readFile(sourcePath);
      await writeFile(await join(bragiDir, 'songs', `${id}.${ext}`), bytes);
      const tags = await readTags(bytes, audioMime(ext));
      const cover = tags.picture ? await saveCover(id, tags.picture) : undefined;

      newSongs.push({
        id,
        path: `${id}.${ext}`,
        name: tags.title ?? stripAudioExt(fileName),
        artist: tags.artist ?? 'Unknown Artist',
        cover,
      });
    }

    onAddSongs(newSongs, viewedPlaylist);
  }

  async function chooseCover(playlist: Playlist) {
    try {
      const cover = await pickCover();
      if (cover) onSetPlaylistCover(playlist, cover);
    } catch (err) {
      console.error("cover failed:", err);
    }
  }

  async function chooseSongCover(song: Song) {
    try {
      const cover = await pickSongCover(song);
      if (cover) onSetSongCover(song, cover);
    } catch (err) {
      console.error("song cover failed:", err);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (copyingSong) {
        if (event.key === "Escape") setCopyingSong(null);
        return;
      }
      if (isTyping || event.target instanceof HTMLInputElement) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "s") {
        onSwitchToSettingsScreen();
      } else if (event.key === "n") {
        event.preventDefault();   // otherwise the "n" would be typed into the name field
        playlistListRef.current?.startCreating();
      } else if (event.key === "a" && viewedPlaylist) {
        importSongs();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTyping, viewedPlaylist, onSwitchToSettingsScreen, copyingSong]);

  const songActions: ExtraAction<Song>[] = [];
  if (otherPlaylists.length > 0) {
    songActions.push({ label: "Add to another playlist", onSelect: (song) => setCopyingSong(song) });
  }
  songActions.push({ label: (s) => (s.cover ? "Change cover" : "Add cover"), onSelect: chooseSongCover });

  return (
    <div className="home_screen_container">
      <div className="bragi_title">
        <span>Bragi</span>
        <button
          className="title_settings_button"
          tabIndex={-1}
          title="Settings (s)"
          aria-label="Settings"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSwitchToSettingsScreen}
        >
          <Settings size={28} strokeWidth={2} />
        </button>
      </div>

      <div className="horizontal_panels">
        <div className="panel playlist_panel">
          <CursorList
            className="playlist_list"
            items={playlists}
            keyExtractor={(p) => p.id}
            renderItem={(p, editor) => (
              <PlaylistListItem
                playlist={p}
                active={p.id === viewedPlaylistId}
                editor={editor}
              />
            )}
            onCreate={onCreatePlaylist}
            onDelete={onDeletePlaylist}
            onReorder={onMovePlaylist}
            onModeChange={setPlaylistsMode}
            onActivate={activatePlaylist}
            ref={playlistListRef}
            editableFields={[{ id: "name", label: "Rename playlist", onCommit: onRenamePlaylist }]}
            extraActions={[
              { label: (p) => (p.cover ? "Change cover image" : "Set cover image"), onSelect: chooseCover },
              { label: "Remove cover image", visible: (p) => !!p.cover, onSelect: (p) => onSetPlaylistCover(p, null) },
            ]}
            deleteLabel="Delete playlist"
          />

          <button
            className="add_button"
            tabIndex={-1}
            title="Create playlist (n)"
            aria-label="Create playlist"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => playlistListRef.current?.startCreating()}
          >
            <Plus strokeWidth={4}/>
          </button>

          <div className="keybinds_footer">
            <div className="keybind_label">Click: open playlist</div>
            <div className="keybind_label">Right-click or ⋮: options</div>
            <div className="keybind_label">Shift + drag: move playlists</div>
            <div className="keybind_label">n: create playlist</div>
            <div className="keybind_label">s: settings</div>
          </div>
        </div>

        {viewedPlaylistId && (<div className="panel song_panel">
          {!viewedPlaylist ? (
            <div className="panel_placeholder">Select a playlist</div>
          ) : (
            <>
              <div className="song_panel_header">
                <div className="song_panel_title">{viewedPlaylist.name}</div>
                <div className="song_panel_count">
                  {playlistSongs.length} {playlistSongs.length === 1 ? "song" : "songs"}
                </div>
              </div>

              {playlistSongs.length === 0 ? (
                <div className="panel_placeholder">No songs yet</div>
              ) : visibleSongs.length === 0 ? (
                <div className="panel_placeholder">No match</div>
              ) : (
                <CursorList
                  className="playlist_list"
                  items={visibleSongs}
                  keyExtractor={(s) => s.id}
                  renderItem={(s, editor) => (
                    <SongListItem song={s} playing={s.id === playingSongId} editor={editor} />
                  )}
                  onModeChange={setSongsMode}
                  editableFields={[
                    { id: "name", label: "Rename song", onCommit: onRenameSong },
                    { id: "artist", label: "Rename artist", onCommit: onRenameArtist },
                  ]}
                  deleteLabel="Delete song"
                  extraActions={songActions}
                  onDelete={(song) => onRemoveSong(song, viewedPlaylist)}
                  onReorder={canReorder ? (song, direction) => onMoveSong(song, viewedPlaylist, direction) : undefined}
                  onActivate={(song) => player.playSong(song, viewedPlaylist, orderedSongs.map(s => s.id))}
                />
              )}

              <div className="song_panel_footer">
                <button
                  className="add_button"
                  tabIndex={-1}
                  title="Add songs (a)"
                  aria-label="Add songs"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => importSongs()}
                >
                  <Plus strokeWidth={4}/>
                </button>

                {playlistSongs.length > 0 && (
                  <>
                    <input
                      className="app_input song_search"
                      type="text"
                      placeholder="Search songs…"
                      spellCheck={false}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); }
                        else if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                    <button
                      className={`app_button sort_button ${sortByArtist ? "sort_button_on" : ""}`}
                      tabIndex={-1}
                      title={sortByArtist ? "Sorted by artist (click for playlist order)" : "Sort by artist"}
                      aria-label="Sort by artist"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setSortByArtist(v => !v)}
                    >
                      <ArrowDownAZ size={22} strokeWidth={2.5} />
                    </button>
                  </>
                )}
              </div>

              <div className="keybinds_footer">
                <div className="keybind_label">Click: play song</div>
                <div className="keybind_label">Right-click or ⋮: options</div>
                <div className="keybind_label">Shift + drag: move songs</div>
                <div className="keybind_label">a: add song</div>
              </div>
            </>
          )}
        </div>)}

        {player.hasPlayed && (<div className="panel main_player">
          <div className="visualizer_area">
            <Visualizer />
          </div>

          <div className="player_bottom">
            <SongCover file={player.currentSong?.cover} className="player_cover_small" />

            <div className="player_group">
              <div className="now_playing">
                {player.currentSong ? (
                  <>
                    <div className="player_song_name">{player.currentSong.name}</div>
                    <div className="player_artist_name">{player.currentSong.artist}</div>
                  </>
                ) : (
                  <div style={{ color: "grey" }}>Nothing playing</div>
                )}
              </div>

              <ProgressBar/>
              <VolumeSlider player={player} />
              <PlayerControls player={player} />
            </div>
          </div>

          <div className="keybinds_footer">
            <div className="keybind_label">Space: play / pause</div>
            <div className="keybind_label">j / l: back / forward 10s</div>
            <div className="keybind_label">Shift + n / p: next / previous</div>
            <div className="keybind_label">o: loop song</div>
            <div className="keybind_label">z: shuffle</div>
          </div>
        </div>)}
      </div>

      {copyingSong && (
        <div className="copy_picker_overlay" onClick={() => setCopyingSong(null)}>
          <div className="copy_picker" onClick={(e) => e.stopPropagation()}>
            <div className="copy_picker_title">Add {copyingSong.name} to:</div>
            <CursorList
              className="playlist_list"
              items={otherPlaylists}
              keyExtractor={(p) => p.id}
              renderItem={(p) => <PlaylistListItem playlist={p} active={false} />}
              onActivate={(target) => {
                onCopySong(copyingSong, target);
                setCopyingSong(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { HomeScreen };