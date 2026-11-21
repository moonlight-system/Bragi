import { join } from '@tauri-apps/api/path';
import { getBragiDir } from './storage';
import { newId, audioMime, Song } from './types_and_functions';
import { readFile } from '@tauri-apps/plugin-fs';
import { readTags } from './importSongs';

export type DeviceMp3 = { id: string; name: string; artist: string | null; ext: string };

declare global {
  interface Window {
    BragiNative?: {
      hasPermission(): boolean;
      askPermission(): void;
      listMp3(): string;
      copyMp3(id: string, destPath: string): boolean;
      insets(): string;
      appVersion?(): string;
      canInstall?(): boolean;
      askInstallPermission?(): void;
      downloadUpdate?(url: string): void;
      updateStatus?(): string;
    };
  }
}

// true only inside the Android app
export const hasNativeAudio = () => !!window.BragiNative;

export async function ensureAudioPermission(): Promise<boolean> {
  const native = window.BragiNative;
  if (!native) return false;
  if (native.hasPermission()) return true;
  return new Promise((resolve) => {
    window.addEventListener(
      'bragi-permission',
      (e) => resolve(!!(e as CustomEvent).detail),
      { once: true }
    );
    native.askPermission();
  });
}

export function listDeviceMp3s(): DeviceMp3[] {
  const items: DeviceMp3[] = JSON.parse(window.BragiNative?.listMp3() ?? '[]');
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

// copies one device mp3 into Bragi/songs and returns its Song record
export async function importDeviceMp3(item: DeviceMp3): Promise<Song | null> {
  const id = newId();
  const dest = await join(await getBragiDir(), 'songs', `${id}.${item.ext}`);
  if (!window.BragiNative?.copyMp3(item.id, dest)) return null;
  // MediaStore's titles are sometimes mis-decoded, so read the tags from the copied file instead
  const bytes = await readFile(dest);
  const { title, artist } = await readTags(bytes, audioMime(item.ext));
  return {
    id,
    path: `${id}.${item.ext}`,
    name: title ?? item.name,                       // MediaStore name only as a fallback
    artist: artist ?? item.artist ?? 'Unknown Artist',
  };
}