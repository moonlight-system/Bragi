import type { Playlist, Song } from "../../types_and_functions";
import type { Player } from "../../usePlayer";
import { Visualizer } from "../Visualizer";
import { ProgressBar } from "../ProgressBar";
import { PressableRow } from "./PressableRow";
import { CoverBox, SongCover } from "../Cover";
import { PlayerControls } from "../PlayerControls";
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
          <CoverBox url={p.cover} className="cover_lg" />
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
          <SongCover file={s.cover} className="cover_md" />
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
  const hasCover = !!song?.cover;

  return (
    <div className="m_player">
      {/* cover + visualizer share this wrapper, so they always have the same width */}
      <div className={`m_art ${hasCover ? "" : "m_art_nocover"}`}>
        {hasCover && (
          <div className="cover_area">
            <SongCover file={song?.cover} className="player_cover" />
          </div>
        )}
        <div className="visualizer_strip"><Visualizer /></div>
      </div>

      <div className="m_now_playing">
        <div className="m_song_name">{song?.name ?? "Nothing playing"}</div>
        <div className="m_song_artist">{song?.artist ?? ""}</div>
      </div>

      <ProgressBar />
      <VolumeSlider player={player} />
      <PlayerControls player={player} />
    </div>
  );
}

export { MobilePlaylistsScreen, MobileSongsScreen, MobilePlayerScreen };