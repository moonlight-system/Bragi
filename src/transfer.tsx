import { join } from '@tauri-apps/api/path';
import { readFile, readTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { getBragiDir } from './storage';
import { AUDIO_EXTENSIONS, audioExt } from './types_and_functions';
import type { Playlist, Song } from './types_and_functions';

// A transfer is described by a manifest: the songs (with their files) and the playlists.
export const MANIFEST_NAME = 'bragi-transfer.json';

export type PackageSong = { id: string; name: string; artist: string; file: string; cover?: string };
export type PackagePlaylist = { id: string; name: string; cover?: string; songIds: string[] };
export type Manifest = { app: 'bragi-transfer'; version: 1; songs: PackageSong[]; playlists: PackagePlaylist[] };

// "playlistId|songId" for every ticked song of every playlist
export type Selection = Set<string>;
export const selKey = (playlistId: string, songId: string) => `${playlistId}|${songId}`;

// a message that is meant to be shown to the user as it is
class UserError extends Error {}

// names coming from the other device are never trusted: only plain file names are accepted
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SAFE_AUDIO_FILE = /^[A-Za-z0-9-]{1,64}\.[a-z0-9]{1,5}$/;
const SAFE_COVER_FILE = /^[A-Za-z0-9-]{1,100}\.jpg$/;

const tick = () => new Promise<void>(resolve => setTimeout(resolve));

// ---------- reading and checking a manifest ----------

export function parseManifest(text: string): Manifest {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new UserError('This is not a Bragi transfer.'); }
  if (raw?.app !== 'bragi-transfer' || !Array.isArray(raw.songs) || !Array.isArray(raw.playlists)) {
    throw new UserError('This is not a Bragi transfer.');
  }

  const songs: PackageSong[] = [];
  const songIds = new Set<string>();
  for (const s of raw.songs) {
    const id = String(s?.id ?? '');
    const file = String(s?.file ?? '');
    if (!SAFE_ID.test(id) || songIds.has(id) || !SAFE_AUDIO_FILE.test(file)) continue;
    if (!AUDIO_EXTENSIONS.includes(audioExt(file))) continue;
    // a cover must belong to its own song, so it can never overwrite another song's cover
    const cover = typeof s.cover === 'string' && SAFE_COVER_FILE.test(s.cover) && s.cover.startsWith(id) ? s.cover : undefined;
    songIds.add(id);
    songs.push({
      id,
      file,
      name: String(s.name ?? '').trim() || file,
      artist: String(s.artist ?? '').trim() || 'Unknown Artist',
      cover,
    });
  }

  const playlists: PackagePlaylist[] = [];
  const playlistIds = new Set<string>();
  for (const p of raw.playlists) {
    const id = String(p?.id ?? '');
    if (!SAFE_ID.test(id) || playlistIds.has(id) || !Array.isArray(p.songIds)) continue;
    const ids = [...new Set<string>(p.songIds.map(String))].filter(sid => songIds.has(sid));
    if (ids.length === 0) continue;
    playlistIds.add(id);
    playlists.push({
      id,
      name: String(p.name ?? '').trim() || 'Imported playlist',
      cover: typeof p.cover === 'string' && p.cover.startsWith('data:image/') ? p.cover : undefined,
      songIds: ids,
    });
  }

  return { app: 'bragi-transfer', version: 1, songs, playlists };
}

export async function readManifest(source: Source): Promise<Manifest> {
  return parseManifest(await source.readText(MANIFEST_NAME));
}

// every song of every playlist ticked
export function selectAllOf(manifest: Manifest): Selection {
  const all: Selection = new Set();
  for (const p of manifest.playlists) for (const id of p.songIds) all.add(selKey(p.id, id));
  return all;
}

export function selectEverything(playlists: Playlist[]): Selection {
  const all: Selection = new Set();
  for (const p of playlists) for (const id of p.songIds) all.add(selKey(p.id, id));
  return all;
}

// builds the manifest of what is ticked in this device's own library
export function buildManifest(playlists: Playlist[], songs: Song[], selection: Selection): Manifest {
  const songById = new Map(songs.map(s => [s.id, s]));
  const outSongs = new Map<string, PackageSong>();
  const outPlaylists: PackagePlaylist[] = [];

  for (const p of playlists) {
    const ids = p.songIds.filter(id => selection.has(selKey(p.id, id)) && songById.has(id));
    if (ids.length === 0) continue;
    for (const id of ids) {
      const s = songById.get(id)!;
      outSongs.set(id, { id, name: s.name, artist: s.artist, file: s.path, cover: s.cover });
    }
    outPlaylists.push({ id: p.id, name: p.name, cover: p.cover, songIds: ids });
  }
  return { app: 'bragi-transfer', version: 1, songs: [...outSongs.values()], playlists: outPlaylists };
}

// ---------- import ----------

// where an import reads from
export type Source = {
  label: string;
  readText(name: string): Promise<string>;
  readBytes(name: string): Promise<Uint8Array | null>;   // null = not there
};

export type ImportStats = {
  added: number;          // new songs copied into the library
  alreadyHere: number;    // same id: already in the library
  duplicates: number;     // same title + artist and identical file: the existing song was reused
  keptSeparate: number;   // same title + artist but a different file: both kept
  missing: number;        // listed in the transfer, but the file was not there
  playlists: number;
};

export type ImportResult = { songs: Song[]; playlists: PackagePlaylist[]; stats: ImportStats };

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Copies the chosen songs into the library and returns what the app state must add.
// Files are written under their own id, so nothing already in the library is ever overwritten.
export async function importPackage(
  source: Source,
  manifest: Manifest,
  selection: Selection,
  localSongs: Song[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const wanted = new Set<string>();
  for (const p of manifest.playlists) {
    for (const id of p.songIds) if (selection.has(selKey(p.id, id))) wanted.add(id);
  }

  const incomingById = new Map(manifest.songs.map(s => [s.id, s]));
  const localIds = new Set(localSongs.map(s => s.id));
  const bragiDir = await getBragiDir();
  const idMap = new Map<string, string>();   // id in the transfer -> id in this library
  const newSongs: Song[] = [];
  const stats: ImportStats = { added: 0, alreadyHere: 0, duplicates: 0, keptSeparate: 0, missing: 0, playlists: 0 };

  let done = 0;
  for (const id of wanted) {
    onProgress?.(++done, wanted.size);
    const incoming = incomingById.get(id);
    if (!incoming) continue;

    // same id = the same song, seen before (an earlier transfer)
    if (localIds.has(incoming.id)) {
      idMap.set(incoming.id, incoming.id);
      stats.alreadyHere++;
      continue;
    }

    const bytes = await source.readBytes(incoming.file);
    if (!bytes) { stats.missing++; continue; }

    // same title + artist under another id: identical file = reuse it, different file = keep both
    const twin = localSongs.find(s => norm(s.name) === norm(incoming.name) && norm(s.artist) === norm(incoming.artist));
    if (twin) {
      let twinBytes: Uint8Array | null = null;
      try { twinBytes = await readFile(await join(bragiDir, 'songs', twin.path)); } catch {}
      if (twinBytes && sameBytes(twinBytes, bytes)) {
        idMap.set(incoming.id, twin.id);
        stats.duplicates++;
        continue;
      }
      stats.keptSeparate++;
    }

    const path = `${incoming.id}.${audioExt(incoming.file)}`;
    await writeFile(await join(bragiDir, 'songs', path), bytes);

    let cover: string | undefined;
    if (incoming.cover) {
      const coverBytes = await source.readBytes(incoming.cover);
      if (coverBytes) {
        await writeFile(await join(bragiDir, 'covers', incoming.cover), coverBytes);
        cover = incoming.cover;
      }
    }

    newSongs.push({ id: incoming.id, path, name: incoming.name, artist: incoming.artist, cover });
    idMap.set(incoming.id, incoming.id);
    stats.added++;
    await tick();   // lets the progress text repaint
  }

  const playlists: PackagePlaylist[] = [];
  for (const p of manifest.playlists) {
    const ids = [...new Set(
      p.songIds
        .filter(id => selection.has(selKey(p.id, id)))
        .map(id => idMap.get(id))
        .filter((id): id is string => !!id),
    )];
    if (ids.length > 0) playlists.push({ id: p.id, name: p.name, cover: p.cover, songIds: ids });
  }
  stats.playlists = playlists.length;

  return { songs: newSongs, playlists, stats };
}

// ---------- the phone talks to the computer ----------

export type Remote = { address: string; pin: string };

async function request(remote: Remote, path: string, init: RequestInit = {}, timeoutMs = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const sep = path.includes('?') ? '&' : '?';
  try {
    const res = await fetch(`http://${remote.address}${path}${sep}pin=${encodeURIComponent(remote.pin)}`, {
      ...init,
      signal: controller.signal,
    });
    if (res.status === 403) throw new UserError('Wrong code. Check the code shown on the computer.');
    if (res.status === 429) throw new UserError('Too many wrong codes. Close and reopen Transfer on the computer to reset.');
    return res;
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError('Could not reach the computer. Check that both devices are on the same Wi-Fi, that Transfer is open on the computer, and that the address is right.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function connect(addressInput: string, pinInput: string): Promise<Remote> {
  const address = addressInput.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const pin = pinInput.trim();
  if (!/^[A-Za-z0-9.-]+:\d{1,5}$/.test(address)) {
    throw new UserError('Enter the address as shown on the computer, for example 192.168.1.20:47831.');
  }
  if (!/^\d{6}$/.test(pin)) throw new UserError('The code has 6 digits.');
  const remote = { address, pin };
  const res = await request(remote, '/ping', {}, 8000);
  if (!res.ok) throw new UserError('The computer did not accept the connection.');
  return remote;
}

// the computer's library, readable like any other import source
export function remoteSource(remote: Remote): Source {
  return {
    label: remote.address,
    async readText(name) {
      const res = await request(remote, name === MANIFEST_NAME ? '/manifest' : `/file/${encodeURIComponent(name)}`, {}, 15000);
      if (!res.ok) throw new UserError('The computer did not send its library.');
      return res.text();
    },
    async readBytes(name) {
      const res = await request(remote, `/file/${encodeURIComponent(name)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new UserError('The computer could not send a file.');
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

// sends the ticked songs to the computer; it imports them when the manifest arrives (last)
export async function pushPackage(
  remote: Remote,
  manifest: Manifest,
  onProgress?: (done: number, total: number) => void,
): Promise<{ songs: number; playlists: number; missing: number }> {
  const bragiDir = await getBragiDir();

  async function upload(name: string, body: Blob | string) {
    const res = await request(remote, `/upload/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },   // keeps the browser from asking permission first
      body,
    });
    if (!res.ok) throw new UserError('The computer refused a file.');
  }

  const okSongs: PackageSong[] = [];
  let missing = 0;

  for (let i = 0; i < manifest.songs.length; i++) {
    onProgress?.(i + 1, manifest.songs.length);
    const song = manifest.songs[i];

    let bytes: Uint8Array;
    try { bytes = await readFile(await join(bragiDir, 'songs', song.file)); } catch { missing++; continue; }
    await upload(song.file, new Blob([new Uint8Array(bytes)]));

    let cover = song.cover;
    if (cover) {
      let coverBytes: Uint8Array | null = null;
      try { coverBytes = await readFile(await join(bragiDir, 'covers', cover)); } catch {}
      if (coverBytes) await upload(cover, new Blob([new Uint8Array(coverBytes)]));
      else cover = undefined;
    }
    okSongs.push({ ...song, cover });
  }

  const ids = new Set(okSongs.map(s => s.id));
  const playlists = manifest.playlists
    .map(p => ({ ...p, songIds: p.songIds.filter(id => ids.has(id)) }))
    .filter(p => p.songIds.length > 0);

  await upload(MANIFEST_NAME, JSON.stringify({ ...manifest, songs: okSongs, playlists }));
  const done = await request(remote, '/done', { method: 'POST' });
  if (!done.ok) throw new UserError('The computer did not confirm the transfer.');

  return { songs: okSongs.length, playlists: playlists.length, missing };
}

// ---------- the computer reads what the phone uploaded ----------

export async function incomingSource(): Promise<Source> {
  const dir = await join(await getBragiDir(), 'incoming');
  return {
    label: 'the phone',
    readText: async (name) => readTextFile(await join(dir, name)),
    readBytes: async (name) => {
      try { return await readFile(await join(dir, name)); } catch { return null; }
    },
  };
}