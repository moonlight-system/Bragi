import "./VolumeSlider.css";
import { useRef } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import type { Player } from "../usePlayer";

function VolumeSlider({ player }: { player: Player }) {
  const lastRef = useRef(1);   // volume to come back to when un-muting
  const v = player.volume;
  const Icon = v === 0 ? VolumeX : v < 0.5 ? Volume1 : Volume2;

  function toggleMute() {
    if (v > 0) { lastRef.current = v; player.setVolume(0); }
    else player.setVolume(lastRef.current || 1);
  }

  return (
    <div className="volume_row">
      <button className="app_button volume_button" onMouseDown={(e) => e.preventDefault()} onClick={toggleMute}>
        <Icon size={24} strokeWidth={3} />
      </button>
      <input
        type="range"
        className="volume_slider"
        min={0}
        max={1}
        step={0.01}
        value={v}
        tabIndex={-1}
        style={{ "--fill": `${v * 100}%` } as React.CSSProperties}
        onChange={(e) => player.setVolume(parseFloat(e.target.value))}
        // a focused <input> would swallow the Space shortcut (App.tsx ignores inputs)
        onPointerUp={(e) => e.currentTarget.blur()}
      />
    </div>
  );
}

export { VolumeSlider };