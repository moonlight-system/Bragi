import { join } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';
import { getBragiDir } from './storage';
import { newId, audioMime } from './types_and_functions';
import type { Song } from './types_and_functions';
import { readTags, saveCover } from './importSongs';

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

  // MediaStore's titles are sometimes mis-decoded, so read the tags (and the cover) from the copied file
  const bytes = await readFile(dest);
  const tags = await readTags(bytes, audioMime(item.ext));
  const cover = tags.picture ? await saveCover(id, tags.picture) : undefined;
  return {
    id,
    path: `${id}.${item.ext}`,
    name: tags.title ?? item.name,
    artist: tags.artist ?? item.artist ?? 'Unknown Artist',
    cover,
  };
}