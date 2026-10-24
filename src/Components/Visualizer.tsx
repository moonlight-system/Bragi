import "./Visualizer.css";
import { useEffect, useRef } from "react";
import { getAnalyser } from "../usePlayer";
import { getCssVariable } from "../types_and_functions";

// --- tuning knobs (all sizes are in canvas pixels, not screen pixels) ---
const BAR_WIDTH = 6;
const BAR_GAP = 2;
const CANVAS_HEIGHT = 64;
const SEGMENT_HEIGHT = 4;   // each bar is a stack of blocks this tall
const SEGMENT_GAP = 1;      // set to 0 for solid bars
const MIN_FREQ = 50;        // Hz: left edge of the first bar
const MAX_FREQ = 16000;     // Hz: right edge of the last bar
const HIGH_BOOST = 0.6;     // extra gain at the far-right bar (treble is naturally quieter)

// Bar k covers [edges[k], edges[k+1]) in FFT bins. The edges grow geometrically,
// so every bar spans the same number of octaves (this is the log grouping).
function computeBinEdges(analyser: AnalyserNode, barCount: number): number[] {
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const ratio = MAX_FREQ / MIN_FREQ;
  const edges: number[] = [];
  for (let i = 0; i <= barCount; i++) {
    const freq = MIN_FREQ * Math.pow(ratio, i / barCount);
    edges.push(Math.floor(freq / binHz));
  }
  return edges;
}

function Visualizer({ barCount = 32 }: { barCount?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;

    // read once: changing the theme happens in Settings, which unmounts this component
    const color = getCssVariable("--visualizer-accent-color");
    const segmentCount = Math.floor(CANVAS_HEIGHT / SEGMENT_HEIGHT);

    let data = new Uint8Array(0);   // reused every frame, never reallocated
    let edges: number[] = [];
    let frameId = 0;

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      g.clearRect(0, 0, canvas.width, canvas.height);

      const analyser = getAnalyser();
      if (!analyser) return; // no song has been played yet

      if (data.length !== analyser.frequencyBinCount) {
        data = new Uint8Array(analyser.frequencyBinCount);
        edges = computeBinEdges(analyser, barCount);
      }
      analyser.getByteFrequencyData(data); // fills `data` with 0–255 per bin

      g.fillStyle = color;
      for (let bar = 0; bar < barCount; bar++) {
        // loudest bin inside this bar's frequency range
        const start = edges[bar];
        const end = Math.min(Math.max(edges[bar + 1], start + 1), data.length);
        let peak = 0;
        for (let bin = start; bin < end; bin++) {
          peak = Math.max(peak, data[bin]);
        }

        const tilt = 1 + HIGH_BOOST * (bar / barCount);
        const level = Math.min(1, (peak / 255) * tilt);
        const litSegments = Math.round(level * segmentCount);

        const x = bar * (BAR_WIDTH + BAR_GAP);
        for (let s = 0; s < litSegments; s++) {
          const y = CANVAS_HEIGHT - (s + 1) * SEGMENT_HEIGHT;
          g.fillRect(x, y, BAR_WIDTH, SEGMENT_HEIGHT - SEGMENT_GAP);
        }
      }
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [barCount]);

  return (
    <canvas
      ref={canvasRef}
      className="visualizer_canvas"
      width={barCount * (BAR_WIDTH + BAR_GAP) - BAR_GAP}
      height={CANVAS_HEIGHT}
    />
  );
}

export { Visualizer };