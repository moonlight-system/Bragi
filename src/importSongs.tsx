import { join } from '@tauri-apps/api/path';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { parseBuffer } from 'music-metadata';
import { getBragiDir } from './storage';
import { newId, audioExt, audioMime, stripAudioExt, AUDIO_EXTENSIONS } from './types_and_functions';
import type { Song } from './types_and_functions';

const COVER_SIZE = 512;   // covers are shrunk to this many pixels (square)

export type Picture = { data: Uint8Array; format: string };
export type Tags = { title: string | null; artist: string | null; picture: Picture | null };

export async function readTags(bytes: Uint8Array, mimeType: string): Promise<Tags> {
  try {
    const meta = await parseBuffer(bytes, { mimeType }, { duration: false, skipCovers: false });
    const pictures = meta.common.picture ?? [];
    const picture = pictures.find(p => p.type?.toLowerCase().includes('front')) ?? pictures[0] ?? null;
    return {
      title: meta.common.title?.trim() || null,
      artist: meta.common.artist?.trim() || null,
      picture: picture ? { data: picture.data, format: picture.format } : null,
    };
  } catch (err) {
    console.error('could not read tags:', err);
    return { title: null, artist: null, picture: null };
  }
}

// crops the picture to a centered square, shrinks it, saves it as covers/<id>.jpg; returns the file name
export async function saveCover(id: string, picture: Picture): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(picture.data)], { type: picture.format }));
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(COVER_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')!.drawImage(
      bitmap,
      (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
      0, 0, size, size,
    );
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return undefined;

    const file = `${id}.jpg`;
    await writeFile(await join(await getBragiDir(), 'covers', file), new Uint8Array(await blob.arrayBuffer()));
    return file;
  } catch (err) {
    console.error('could not save cover:', err);
    return undefined;
  }
}

// for songs imported before covers existed: reads the file again and extracts its cover
export async function refreshSongCover(song: Song): Promise<string | undefined> {
  const bytes = await readFile(await join(await getBragiDir(), 'songs', song.path));
  const { picture } = await readTags(bytes, audioMime(audioExt(song.path)));
  return picture ? saveCover(song.id, picture) : undefined;
}

// opens the system file picker and imports the chosen audio files; calls onSong as each one finishes
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

    const [, tags] = await Promise.all([
      writeFile(dest, bytes),
      readTags(bytes, audioMime(ext)),
    ]);
    const cover = tags.picture ? await saveCover(id, tags.picture) : undefined;

    onSong({
      id,
      path: `${id}.${ext}`,
      name: tags.title ?? stripAudioExt(file.name),
      artist: tags.artist ?? 'Unknown Artist',
      cover,
    });
  }
}