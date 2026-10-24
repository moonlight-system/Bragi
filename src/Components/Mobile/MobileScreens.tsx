import type { Playlist, Song } from "../../types_and_functions";
import type { Player } from "../../usePlayer";
import { Visualizer } from "../Visualizer";
import { ProgressBar } from "../ProgressBar";
import { PressableRow } from "./PressableRow";
import { SkipBack, SkipForward, Play, Pause, Repeat1, Shuffle, RotateCcw, RotateCw } from "lucide-react";
import { VolumeSlider } from "../VolumeSlider";

function MobilePlaylistsScreen({ playlists, onOpen, onMenu }: {
  playlists: Playlist[];
  onOpen: (playlist: Playlist) => void;
  onMenu: (playlist: Playlist) => void;
}) {
  if (playlists.length === 0) return <div className="m_empty">No playlists yet</div>;
  return (
    <div>
      {playlists.map(p => (
        <PressableRow key={p.id} className="m_playlist_item" onTap={() => onOpen(p)} onMenu={() => onMenu(p)}>
          <div
            className="m_cover"
            style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined}
          />
          <div className="m_playlist_text">
            <div className="m_playlist_name">{p.name}</div>
            <div className="m_item_sub">
              {p.songIds.length} {p.songIds.length === 1 ? "song" : "songs"}
            </div>
          </div>
        </PressableRow>
      ))}
    </div>
  );
}

function MobileSongsScreen({ playlist, songs, playingSongId, onPlay, onMenu }: {
  playlist: Playlist;
  songs: Song[];
  playingSongId: string | null;
  onPlay: (song: Song) => void;
  onMenu: (song: Song) => void;
}) {
  const playlistSongs = playlist.songIds
    .map(id => songs.find(s => s.id === id))
    .filter((s): s is Song => s !== undefined);

  if (playlistSongs.length === 0) return <div className="m_empty">No songs yet. Tap + to add some.</div>;
  return (
    <div>
      {playlistSongs.map(s => (
        <PressableRow key={s.id} className="m_list_item" onTap={() => onPlay(s)} onMenu={() => onMenu(s)}>
          <div className="m_row_text">
            <div style={{ color: s.id === playingSongId ? "var(--songs-accent-color)" : "var(--text-color)" }}>
              {s.name}
            </div>
            <div className="m_item_sub">{s.artist}</div>
          </div>
        </PressableRow>
      ))}
    </div>
  );
}

function MobilePlayerScreen({ player }: { player: Player }) {
  const song = player.currentSong;
  const accent = (on: boolean) => ({ color: on ? "var(--buttons-accent-color)" : "var(--text-color)" });

  return (
    <div className="m_player">
      <div className="m_visualizer"><Visualizer /></div>

      <div className="m_now_playing">
        <div className="m_song_name">{song?.name ?? "Nothing playing"}</div>
        <div className="m_song_artist">{song?.artist ?? ""}</div>
      </div>

      <ProgressBar />
      <VolumeSlider player={player} />

      <div className="m_controls_main">
        <button className="app_button m_icon_btn" onClick={player.previous}><SkipBack size={24} fill="currentColor" /></button>
        <button className="app_button m_icon_btn" onClick={() => player.seekBy(-10)}><RotateCcw size={22} /></button>
        <button className="app_button m_icon_btn m_play" onClick={player.togglePlay}>
          {player.isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
        </button>
        <button className="app_button m_icon_btn" onClick={() => player.seekBy(10)}><RotateCw size={22} /></button>
        <button className="app_button m_icon_btn" onClick={player.next}><SkipForward size={24} fill="currentColor" /></button>
      </div>

      <div className="m_controls_secondary">
        <button className="app_button m_icon_btn" style={accent(player.loop)} onClick={player.toggleLoop}><Repeat1 size={22} /></button>
        <button className="app_button m_icon_btn" style={accent(player.shuffle)} onClick={player.toggleShuffle}><Shuffle size={22} /></button>
      </div>
    </div>
  );
}

export { MobilePlaylistsScreen, MobileSongsScreen, MobilePlayerScreen };