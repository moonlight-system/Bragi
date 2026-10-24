import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import type { Playlist, Song, UserPreferences } from './types_and_functions';
import { appDataDir, homeDir, join } from '@tauri-apps/api/path';
const isAndroid = navigator.userAgent.includes('Android');

async function getBragiDir() {
  return isAndroid ? appDataDir() : join(await homeDir(), 'Bragi');
}

async function ensureBragiFolders() {
  const bragiDir = await getBragiDir();
  const songsDir = await join(bragiDir, 'songs');

  if (!(await exists(bragiDir))) {
    await mkdir(bragiDir, { recursive: true });
  }
  if (!(await exists(songsDir))) {
    await mkdir(songsDir, { recursive: true });
  }
}

async function loadPlaylists(): Promise<Playlist[]> {
  const bragiDir = await getBragiDir();
  const filePath = await join(bragiDir, 'playlists.json');

  if (!(await exists(filePath))) {
    return [];
  }
  const content = await readTextFile(filePath);
  return JSON.parse(content);
}

async function savePlaylists(playlists: Playlist[]): Promise<void> {
  const bragiDir = await getBragiDir();
  const filePath = await join(bragiDir, 'playlists.json');
  await writeTextFile(filePath, JSON.stringify(playlists, null, 2));
}

async function loadSongs(): Promise<Song[]> {
  const bragiDir = await getBragiDir();
  const filePath = await join(bragiDir, 'songs.json');

  if (!(await exists(filePath))) {
    return [];
  }
  const content = await readTextFile(filePath);
  return JSON.parse(content);
}

async function saveSongs(songs: Song[]): Promise<void> {
  const bragiDir = await getBragiDir();
  const filePath = await join(bragiDir, 'songs.json');
  await writeTextFile(filePath, JSON.stringify(songs, null, 2));
}


const PREFERENCES_FILE = 'settings_user_preferrences.json';

async function loadPreferences(): Promise<UserPreferences> {
  const bragiDir = await getBragiDir();
  const filePath = await join(bragiDir, PREFERENCES_FILE);

  if (!(await exists(filePath))) {
    return { colors: {} };
  }
  try {
    const parsed = JSON.parse(await readTextFile(filePath));
    return { colors: parsed.colors ?? {}, backOnRight: parsed.backOnRight ?? false, showKeybinds: parsed.showKeybinds ?? true, font: parsed.font, fontSize: parsed.fontSize };
  } catch {
    // unreadable or corrupted file: start from the defaults instead of crashing the app
    return { colors: {} };
  }
}

async function savePreferences(preferences: UserPreferences): Promise<void> {
  const bragiDir = await getBragiDir();
  const filePath = await join(bragiDir, PREFERENCES_FILE);
  await writeTextFile(filePath, JSON.stringify(preferences, null, 2));
}

export { ensureBragiFolders, loadPlaylists, savePlaylists, loadSongs, saveSongs, loadPreferences, savePreferences, getBragiDir };