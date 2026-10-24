import { join } from '@tauri-apps/api/path';
import { writeFile } from '@tauri-apps/plugin-fs';
import { parseBuffer } from 'music-metadata';
import { getBragiDir } from './storage';
import { newId, audioExt, audioMime, stripAudioExt, AUDIO_EXTENSIONS } from './types_and_functions';
import type { Song } from './types_and_functions';

async function readTags(bytes: Uint8Array, mimeType: string): Promise<{ title: string | null; artist: string | null }> {
  try {
    const meta = await parseBuffer(bytes, { mimeType }, { duration: false, skipCovers: true });
    console.log('tags:', meta.common.title, '|', meta.common.artist, '| tag types:', meta.format.tagTypes);
    console.log('frames:', Object.entries(meta.native).map(([type, tags]) => [type, tags.map(t => t.id)]));
    
    return { title: meta.common.title?.trim() || null, artist: meta.common.artist?.trim() || null };
  } catch (err) {
    console.error('could not read tags:', err);
    return { title: null, artist: null };
  }
}

// opens the system file picker and imports the chosen mp3s; calls onSong as each one finishes
export async function pickSongs(onSong: (song: Song) => void): Promise<void> {
  // must be created and clicked synchronously, inside the tap that triggered the import
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '*/*';
  input.multiple = true;

  const files = await new Promise<File[]>((resolve) => {
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
  if (files.length === 0) return;

  const audioFiles = files.filter(f => f.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(audioExt(f.name)));
  if (audioFiles.length === 0) return;

  const bragiDir = await getBragiDir();
  for (const file of audioFiles) {
    const id = newId();
    const ext = audioExt(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dest = await join(bragiDir, 'songs', `${id}.${ext}`);

    const [, { title, artist }] = await Promise.all([
      writeFile(dest, bytes),
      readTags(bytes, audioMime(ext)),
    ]);

    onSong({
      id,
      path: `${id}.${ext}`,
      name: title ?? stripAudioExt(file.name),
      artist: artist ?? 'Unknown Artist',
    });
  }
}