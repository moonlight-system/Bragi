import "./PlayerControls.css";
import { Pause, Play, Repeat1, RotateCcw, RotateCw, Shuffle, SkipBack, SkipForward } from "lucide-react";
import type { Player } from "../usePlayer";

function PlayerControls({ player }: { player: Player }) {
  // onMouseDown preventDefault: the button never takes focus, so Space keeps pausing the music
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="controls_row">
      <button className="ctrl_btn" title="Previous (Shift+P)" onMouseDown={keep} onClick={player.previous}>
        <SkipBack size={24} strokeWidth={2.5} fill="currentColor" />
      </button>
      <button className="ctrl_btn" title="Back 10s (j)" onMouseDown={keep} onClick={() => player.seekBy(-10)}>
        <RotateCcw size={24} strokeWidth={2.5} />
      </button>

      <button className="ctrl_btn ctrl_play" title="Play / pause (Space)" onMouseDown={keep} onClick={player.togglePlay}>
        {player.isPlaying
          ? <Pause size={28} strokeWidth={2.5} fill="currentColor" />
          : <Play size={28} strokeWidth={2.5} fill="currentColor" />}
      </button>

      <button className="ctrl_btn" title="Forward 10s (l)" onMouseDown={keep} onClick={() => player.seekBy(10)}>
        <RotateCw size={24} strokeWidth={2.5} />
      </button>
      <button className="ctrl_btn" title="Next (Shift+N)" onMouseDown={keep} onClick={player.next}>
        <SkipForward size={24} strokeWidth={2.5} fill="currentColor" />
      </button>

      <div className="ctrl_separator" />

      <button
        className={`ctrl_btn ctrl_toggle ${player.loop ? "ctrl_on" : ""}`}
        title="Loop song (o)"
        onMouseDown={keep}
        onClick={player.toggleLoop}
      >
        <Repeat1 size={24} strokeWidth={2.5} />
      </button>
      <button
        className={`ctrl_btn ctrl_toggle ${player.shuffle ? "ctrl_on" : ""}`}
        title="Shuffle (z)"
        onMouseDown={keep}
        onClick={player.toggleShuffle}
      >
        <Shuffle size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export { PlayerControls };