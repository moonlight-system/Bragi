import { useEffect, useRef, useState } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { getBragiDir } from './storage';
import type { Playlist, Song } from './types_and_functions';
import { getCssVariable, audioExt, audioMime } from './types_and_functions';

// One audio element for the whole app, created once at module level.
const audio = new Audio();

type AudioGraph = {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  gain: GainNode;
};

let graph: AudioGraph | null = null;

// 0..1, remembered between launches
let volume = (() => {
  try {
    const v = parseFloat(localStorage.getItem('bragi-volume') ?? '');
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch { return 1; }
})();

function applyVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (graph) graph.gain.gain.value = volume;
  try { localStorage.setItem('bragi-volume', String(volume)); } catch {}
}

// Built lazily, on the first song. `createMediaElementSource` can only ever be
// called once per audio element, so this must never run twice.
function ensureAudioGraph(): AudioGraph {
  if (graph) return graph;

  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;               // 2048 frequency bins
  analyser.smoothingTimeConstant = 0.8;  // 0 = jittery, 1 = barely moves

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(analyser);
  analyser.connect(gain);
  gain.connect(ctx.destination);

  graph = { ctx, source, analyser, gain };
  return graph;
}

// the visualizer polls this every frame; null until the first song starts
function getAnalyser(): AnalyserNode | null {
  return graph?.analyser ?? null;
}

// browsers can leave an AudioContext "suspended" until a user gesture
function resumeContext() {
  if (graph && graph.ctx.state === "suspended") {
    graph.ctx.resume();
  }
}

// song currently loaded, and the next song's blob URL (read ahead of time)
let nowPlaying: Song | null = null;
let preloaded: { id: string; url: string } | null = null;

async function readSongBytes(song: Song) {
  const bragiDir = await getBragiDir();
  return readFile(await join(bragiDir, 'songs', song.path));
}

function mimeFor(path: string) {
  return audioMime(audioExt(path));
}


// any CSS color ("hsl(...)", "#abc"...) -> "#rrggbb", which Android can parse
function toHex(css: string) {
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = css;
  return ctx.fillStyle;
}

// tells the Android notification what's playing (the bridge only exists on Android)
function pushMedia() {
  const bridge = (window as any).BragiMedia;
  if (!bridge || !nowPlaying) return;
  bridge.setColor(toHex(getCssVariable('--primary-bg-color')));
  bridge.setAccent(toHex(getCssVariable('--global-accent-color')));
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  bridge.update(nowPlaying.name, nowPlaying.artist, !audio.paused, audio.currentTime * 1000, duration * 1000);
}

type Queue = {
  base: string[];
  order: string[];
  position: number;
  playlistId: string | null;
};

const EMPTY_QUEUE: Queue = { base: [], order: [], position: 0, playlistId: null };

// Fisher–Yates shuffle; `firstId` (the current song) is pinned to the front
function shuffled(ids: string[], firstId: string | null): string[] {
  const rest = ids.filter(id => id !== firstId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return firstId ? [firstId, ...rest] : rest;
}

function usePlayer(songs: Song[]) {
  const [queue, setQueue] = useState<Queue>(EMPTY_QUEUE);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState(false);  
  const currentId: string | undefined = queue.order[queue.position];
  const currentSong = songs.find(s => s.id === currentId) ?? null;
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [volumeState, setVolumeState] = useState(volume);

  const objectUrlRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);

  useEffect(() => {
    const onPlay = () => { setIsPlaying(true); pushMedia(); };
    const onPause = () => { setIsPlaying(false); pushMedia(); };
    const onMeta = () => pushMedia();   // duration known / user seeked
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('seeked', onMeta);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('seeked', onMeta);
    };
  }, []);

  // read the next song into memory while the current one plays
  useEffect(() => {
    const n = queue.order.length;
    if (n === 0) return;
    const nextId = queue.order[(queue.position + 1) % n];
    if (nextId === currentId || preloaded?.id === nextId) return;
    const nextSong = songs.find(s => s.id === nextId);
    if (!nextSong) return;

    let cancelled = false;
    (async () => {
      try {
        const bytes = await readSongBytes(nextSong);
        if (cancelled) return;
        if (preloaded) URL.revokeObjectURL(preloaded.url);
        preloaded = { id: nextId, url: URL.createObjectURL(new Blob([bytes], { type: mimeFor(nextSong.path) })) };
      } catch (err) {
        console.error('could not preload next song:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [queue.order, queue.position, songs]);

  // notification / lock-screen buttons call this from Kotlin
  const controlsRef = useRef({ next: () => {}, previous: () => {}, seekBy: (_s: number) => {} });
  controlsRef.current = { next: () => step(1), previous, seekBy };
  useEffect(() => {
    (window as any).__bragiMedia = (cmd: string, arg: number) => {
      if (cmd === 'play') { resumeContext(); audio.play(); }
      else if (cmd === 'pause') audio.pause();
      else if (cmd === 'next') controlsRef.current.next();
      else if (cmd === 'previous') controlsRef.current.previous();
      else if (cmd === 'seek') audio.currentTime = arg;
      else if (cmd === 'seekby') controlsRef.current.seekBy(arg);
    };
    return () => { delete (window as any).__bragiMedia; };
  }, []);

  async function loadAndPlay(song: Song) {
    const myLoadId = ++loadIdRef.current;
    ensureAudioGraph();
    resumeContext();
    nowPlaying = song;
    try {
      let url: string;
      if (preloaded && preloaded.id === song.id) {
        url = preloaded.url;   // already in memory: no async work needed
        preloaded = null;
      } else {
        const bytes = await readSongBytes(song);
        if (myLoadId !== loadIdRef.current) return; // a newer request replaced this one
        url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(song.path) }));
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      audio.src = url;
      await audio.play();
    } catch (err) {
      console.error('could not play song:', err);
    }
  }

  function playSong(song: Song, playlist: Playlist) {
    setHasPlayed(true);
    const base = [...playlist.songIds];
    const order = shuffle ? shuffled(base, song.id) : base;
    const position = shuffle ? 0 : base.indexOf(song.id);
    setQueue({ base, order, position, playlistId: playlist.id });
    loadAndPlay(song);
  }

  function step(direction: 1 | -1) {
    const { order, position } = queue;
    const n = order.length;
    if (n === 0) return;
  
    // walk in that direction, skipping ids whose Song no longer exists
    for (let i = 1; i <= n; i++) {
      const pos = (((position + direction * i) % n) + n) % n;
      const song = songs.find(s => s.id === order[pos]);
      if (song) {
        setQueue(q => ({ ...q, position: pos }));
        loadAndPlay(song);
        return;
      }
    }
    stop(); // nothing playable left
  }
  
  function previous() {
    // like most players: restart the song if it's already well underway
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    step(-1);
  }

  function stop() {
    loadIdRef.current++; // cancels any load still in flight
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setQueue(EMPTY_QUEUE);
    (window as any).BragiMedia?.stop();
  }

  function toggleShuffle() {
    const turningOn = !shuffle;
    setShuffle(turningOn);
    setQueue(q => {
      const id = q.order[q.position] ?? null;
      if (turningOn) {
        return { ...q, order: shuffled(q.base, id), position: 0 };
      }
      // back to playlist order, continuing from where the current song sits in it
      return { ...q, order: q.base, position: Math.max(0, q.base.indexOf(id ?? '')) };
    });
  }

  function togglePlay() {
    if (!audio.src) return; // nothing loaded yet
    resumeContext();
    if (audio.paused) audio.play();
    else audio.pause();
  }

  function seekBy(seconds: number) {
    if (!audio.src) return;
    const target = audio.currentTime + seconds;
    audio.currentTime = Math.min(Math.max(0, target), audio.duration || 0);
  }

  // the audio element loops a single song natively (and then never fires 'ended')
  useEffect(() => {
    audio.loop = loop;
  }, [loop]);
  
  // auto-advance when a song ends. `step` is recreated every render and reads
  // the current queue, so the listener (registered once) calls the latest one via a ref
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onEnded = () => stepRef.current(1);
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, []);
  
  // the playing song's record was deleted: stop instead of playing a ghost
  useEffect(() => {
    if (currentId && !songs.some(s => s.id === currentId)) stop();
  }, [songs, currentId]);

  return {
    currentSong,
    isPlaying,
    loop,
    shuffle,
    playSong,
    togglePlay,
    next: () => step(1),
    previous,
    toggleLoop: () => setLoop(l => !l),
    toggleShuffle,
    seekBy,
    hasPlayed,
    currentPlaylistId: queue.playlistId,
    volume: volumeState,
    setVolume: (v: number) => { applyVolume(v); setVolumeState(v); },
  };
}

function useAudioTime() {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEmptied = () => {
      setCurrentTime(0);
      setDuration(0);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('emptied', onEmptied);

    // sync right away: this component remounts when you come back from Settings
    onTime();
    onDuration();

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('emptied', onEmptied);
      audio.removeEventListener('seeked', onTime);
    };
  }, []);

  return { currentTime, duration };
}

// jumps to an absolute position (used by the progress bar)
function seekTo(seconds: number) {
  if (!audio.src) return;
  audio.currentTime = Math.min(Math.max(0, seconds), audio.duration || 0);
}

type Player = ReturnType<typeof usePlayer>;

export { usePlayer, useAudioTime, getAnalyser, seekTo };
export type { Player };