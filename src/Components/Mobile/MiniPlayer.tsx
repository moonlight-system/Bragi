import type { Player } from "../../usePlayer";
import { SkipBack, SkipForward, Play, Pause } from "lucide-react";
import { SongCover } from "../Cover";

function MiniPlayer({ player, onOpen }: {
  player: Player;
  onOpen: () => void;
}) {
  const song = player.currentSong;
  if (!song) return null;

  // the buttons must not also trigger the "open full player" tap on the card
  const press = (action: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    action();
  };

  return (
    <div className="m_miniplayer" onClick={onOpen}>
      <SongCover file={song.cover} className="cover_sm" />
      <div className="m_mini_text">
        <div className="m_mini_name">{song.name}</div>
        <div className="m_mini_artist">{song.artist}</div>
      </div>
      <div className="m_mini_controls">
        <button className="m_mini_btn" onClick={press(player.previous)}><SkipBack size={22} fill="currentColor" /></button>
        <button className="m_mini_btn" onClick={press(player.togglePlay)}>
          {player.isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>
        <button className="m_mini_btn" onClick={press(player.next)}><SkipForward size={22} fill="currentColor" /></button>
      </div>
    </div>
  );
}

export { MiniPlayer };