export type Song = {
  id: string;
  path: string;   // path to the mp3 file, relative to the songs/ folder
  name: string;
  artist: string;
};

export type Playlist = {
  id: string;
  name: string;
  songIds: string[];
  cover?: string;   // data URL of the cover image, if the user set one
};

export function getCssVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export type UserPreferences = {
  colors: Record<string, string>;
  backOnRight?: boolean;
  showKeybinds?: boolean;
  font?: string;
  fontSize?: string;
};

export const isAndroid = navigator.userAgent.includes('Android');

// crypto.randomUUID only exists in secure contexts; getRandomValues works everywhere
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;   // UUID version 4
  b[8] = (b[8] & 0x3f) | 0x80;   // UUID variant
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wav', 'weba'];

// "song.FLAC" -> "flac" ("mp3" if there is no extension)
export function audioExt(fileName: string): string {
  return fileName.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? 'mp3';
}

export function audioMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'ogg': case 'oga': case 'opus': return 'audio/ogg';
    case 'wav': return 'audio/wav';
    case 'weba': return 'audio/webm';
    default: return 'audio/mpeg';
  }
}

// removes the extension from a file name
export function stripAudioExt(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, '');
}