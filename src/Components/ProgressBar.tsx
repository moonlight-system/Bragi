import "./ProgressBar.css";
import { useRef, useState } from "react";
import { useAudioTime, seekTo } from "../usePlayer";
import { formatTime } from "../types_and_functions";

function ProgressBar() {
  const { currentTime, duration } = useAudioTime();
  const trackRef = useRef<HTMLDivElement>(null);
  // while dragging, the bar follows the pointer instead of the audio
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const dragging = dragFraction !== null;
  const percent = dragging
    ? dragFraction * 100
    : duration > 0 ? (currentTime / duration) * 100 : 0;
  const shownTime = dragging ? dragFraction * duration : currentTime;

  function fractionAt(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  return (
    <div className="progress_bar_row">
      <span className="progress_time">{formatTime(shownTime)}</span>
      <div
        ref={trackRef}
        className="progress_track"
        onPointerDown={(e) => {
          if (duration <= 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);   // keeps the drag alive outside the bar
          setDragFraction(fractionAt(e.clientX));
        }}
        onPointerMove={(e) => { if (dragging) setDragFraction(fractionAt(e.clientX)); }}
        onPointerUp={(e) => {
          if (!dragging) return;
          seekTo(fractionAt(e.clientX) * duration);
          setDragFraction(null);
        }}
        onPointerCancel={() => setDragFraction(null)}
      >
        <div className={`progress_fill ${dragging ? "progress_fill_dragging" : ""}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="progress_time">{formatTime(duration)}</span>
    </div>
  );
}

export { ProgressBar };