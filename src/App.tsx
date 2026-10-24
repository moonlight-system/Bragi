// App.tsx
import "./App.css";
import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { HomeScreen } from './Components/Screens/HomeScreen';
import { SettingsScreen } from './Components/Screens/SettingsScreen';
import { ensureBragiFolders, loadPlaylists, savePlaylists, loadSongs, saveSongs, loadPreferences, savePreferences } from './storage';
import type { Playlist, Song, UserPreferences } from './types_and_functions';
import { usePlayer } from './usePlayer';
import { isAndroid, newId } from './types_and_functions';
import { MobileShell } from './Components/Mobile/MobileShell';
import { applyFont, DEFAULT_FONT, applyFontSize, DEFAULT_FONT_SIZE } from './fonts';

function App() {
  const [currentScreen, setCurrentScreen] = useState<"HomeScreen" | "SettingsScreen">("HomeScreen");

  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [songIndex, setSongIndex] = useState(0);
  const [viewedPlaylistId, setViewedPlaylistId] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [preferences, setPreferences] = useState<UserPreferences>({ colors: {} });

  const player = usePlayer(songs);

  // load once on startup
  useEffect(() => {
    async function init() {
      await ensureBragiFolders();
      const [loadedPlaylists, loadedSongs, loadedPreferences] = await Promise.all([
        loadPlaylists(), loadSongs(), loadPreferences(),
      ]);
      setPlaylists(loadedPlaylists);
      setSongs(loadedSongs);

      // apply the saved theme: Settings reads these CSS variables when it opens
      for (const [variable, value] of Object.entries(loadedPreferences.colors)) {
        if (variable.startsWith("--")) document.documentElement.style.setProperty(variable, value);
      }
      setPreferences(loadedPreferences);
      setIsLoaded(true);
    }
    init();
  }, []);

  // save playlists whenever they change (but not before the initial load finishes)
  useEffect(() => {
    if (isLoaded) {
      savePlaylists(playlists);
    }
  }, [playlists, isLoaded]);

  // save songs whenever they change
  useEffect(() => {
    if (isLoaded) {
      saveSongs(songs);
    }
  }, [songs, isLoaded]);

  // save preferences whenever they change; it waits a moment because dragging in a
  // color picker changes the color many times per second
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => savePreferences(preferences), 400);
    return () => clearTimeout(timer);
  }, [preferences, isLoaded]);

  // check for app updates once on startup
  useEffect(() => {
    async function checkForUpdates() {
      if (isAndroid) return;
      try {
        const update = await check();
        if (update) {
          console.log(`found update ${update.version}, downloading...`);
          await update.downloadAndInstall();
          await relaunch();
        }
      } catch (err) {
        console.error('Update check failed:', err);
      }
    }
    checkForUpdates();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;

      if (event.code === "Space") {
        event.preventDefault();
        player.togglePlay();
      } else if (event.shiftKey && event.code === "KeyN") {
        player.next();
      } else if (event.shiftKey && event.code === "KeyP") {
        player.previous();
      } else if (event.key === "o") {
        player.toggleLoop();
      } else if (event.key === "z") {
        player.toggleShuffle();
      } else if (event.key === "j"){
        player.seekBy(-10);
      } else if (event.key === "l") {
        player.seekBy(10);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [player]);

  // synchronous copy of the theme, read by main.tsx before the first paint
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem("bragi-colors", JSON.stringify(preferences.colors));
    } catch {}
  }, [preferences, isLoaded]);

  // lets CSS show or hide the keybind footers
  useEffect(() => {
    document.documentElement.dataset.showKeybinds = String(preferences.showKeybinds ?? true);
  }, [preferences.showKeybinds]);

  // apply the chosen font and keep a synchronous copy for the next startup
  useEffect(() => {
    if (!isLoaded) return;   // before loading, preferences are empty and would reset the font to the default
    const name = preferences.font ?? DEFAULT_FONT;
    applyFont(name);
    try { localStorage.setItem("bragi-font", name); } catch {}
  }, [preferences.font, isLoaded]);

  // apply the chosen font size and keep a synchronous copy for the next startup
  useEffect(() => {
    if (!isLoaded) return;
    const name = preferences.fontSize ?? DEFAULT_FONT_SIZE;
    applyFontSize(name);
    try { localStorage.setItem("bragi-font-size", name); } catch {}
  }, [preferences.fontSize, isLoaded]);

  function updateColors(changes: Record<string, string>) {
    setPreferences(prev => ({ ...prev, colors: { ...prev.colors, ...changes } }));
  }

  function setBackOnRight(value: boolean) {
    setPreferences(prev => ({ ...prev, backOnRight: value }));
  }

  function setFont(name: string) {
    setPreferences(prev => ({ ...prev, font: name }));
  }

  function setFontSize(name: string) {
    setPreferences(prev => ({ ...prev, fontSize: name }));
  }

  function setShowKeybinds(value: boolean) {
    setPreferences(prev => ({ ...prev, showKeybinds: value }));
  }

  function switchToHomeScreen() {
    setCurrentScreen("HomeScreen");
  }

  function onSwitchToSettingsScreen() {
    setCurrentScreen("SettingsScreen");
  }

  function createPlaylist(name: string) {
    const newPlaylist: Playlist = { id: newId(), name, songIds: [] };
    setPlaylists(prevList => [newPlaylist, ...prevList]);
  }

  function deletePlaylist(playlistToRemove: Playlist) {
    setPlaylists(prev => prev.filter(item => item.id !== playlistToRemove.id));
  }

  function renamePlaylist(playlistToRename: Playlist, newName: string) {
    setPlaylists(prev =>
      prev.map(item =>
        item.id === playlistToRename.id ? { ...item, name: newName } : item
      )
    );
  }

  function setPlaylistCover(playlistToUpdate: Playlist, cover: string | null) {
    setPlaylists(prev =>
      prev.map(p => (p.id === playlistToUpdate.id ? { ...p, cover: cover ?? undefined } : p))
    );
  }

  function movePlaylist(playlistToMove: Playlist, direction: "up" | "down") {
    setPlaylists(prev => {
      const index = prev.findIndex(p => p.id === playlistToMove.id);
      if (index === -1) return prev;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const updated = [...prev];
      [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
      return updated;
    });
  }

  function addSongs(newSongs: Song[], targetPlaylist: Playlist) {
    setSongs(prev => [...prev, ...newSongs]);
    setPlaylists(prev =>
      prev.map(p =>
        p.id === targetPlaylist.id
          ? { ...p, songIds: [...p.songIds, ...newSongs.map(s => s.id)] }
          : p
      )
    );
    console.log(songs);
  }

  function renameSong(songToRename: Song, newName: string) {
    setSongs(prev =>
      prev.map(s => (s.id === songToRename.id ? { ...s, name: newName } : s))
    );
  }

  function renameArtist(songToUpdate: Song, newArtist: string) {
    setSongs(prev =>
      prev.map(s => (s.id === songToUpdate.id ? { ...s, artist: newArtist } : s))
    );
  }

  function removeSongFromPlaylist(song: Song, playlist: Playlist) {
    const updatedPlaylists = playlists.map(p =>
      p.id === playlist.id
        ? { ...p, songIds: p.songIds.filter(id => id !== song.id) }
        : p
    );
    setPlaylists(updatedPlaylists);

    // if no playlist references this song anymore, drop the Song record too
    const stillUsed = updatedPlaylists.some(p => p.songIds.includes(song.id));
    if (!stillUsed) {
      setSongs(prev => prev.filter(s => s.id !== song.id));
    }
  }

  function moveSong(song: Song, playlist: Playlist, direction: "up" | "down") {
    setPlaylists(prev =>
      prev.map(p => {
        if (p.id !== playlist.id) return p;

        const index = p.songIds.indexOf(song.id);
        if (index === -1) return p;

        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= p.songIds.length) return p;

        const updated = [...p.songIds];
        [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
        return { ...p, songIds: updated };
      })
    );
  }

  function copySongToPlaylist(song: Song, targetPlaylist: Playlist) {
    setPlaylists(prev =>
      prev.map(p =>
        p.id === targetPlaylist.id && !p.songIds.includes(song.id)
          ? { ...p, songIds: [...p.songIds, song.id] }
          : p
      )
    );
  }

  if (isAndroid) {
    return (
      <div className="AppContainer">
        <MobileShell
          playlists={playlists}
          songs={songs}
          player={player}
          onColorsChange={updateColors}
          actions={{
            createPlaylist,
            deletePlaylist,
            renamePlaylist,
            movePlaylist,
            setCover: setPlaylistCover,
            addSongs,
            renameSong,
            renameArtist,
            removeSong: removeSongFromPlaylist,
            moveSong,
            copySong: copySongToPlaylist,
          }}
          backOnRight={preferences.backOnRight ?? false}
          onBackOnRightChange={setBackOnRight}
          font={preferences.font ?? DEFAULT_FONT}
          onFontChange={setFont}
          fontSize={preferences.fontSize ?? DEFAULT_FONT_SIZE}
          onFontSizeChange={setFontSize}
        />
      </div>
    );
  }

  return (
    <div className="AppContainer">
      {currentScreen == "HomeScreen" && (
        <HomeScreen
          playlists={playlists}
          playlistIndex={playlistIndex}
          onPlaylistIndexChange={setPlaylistIndex}
          viewedPlaylistId={viewedPlaylistId}
          onViewedPlaylistIdChange={setViewedPlaylistId}
          onCreatePlaylist={createPlaylist}
          onDeletePlaylist={deletePlaylist}
          onRenamePlaylist={renamePlaylist}
          onMovePlaylist={movePlaylist}
          songs={songs}
          songIndex={songIndex}
          onSongIndexChange={setSongIndex}
          onSwitchToSettingsScreen={onSwitchToSettingsScreen}
          onAddSongs={addSongs}
          onRenameSong={renameSong}
          onRenameArtist={renameArtist}
          onRemoveSong={removeSongFromPlaylist}
          onMoveSong={moveSong}
          onCopySong={copySongToPlaylist}
          player={player}
        />
      )}
      {currentScreen == "SettingsScreen" && (
        <SettingsScreen
          onswitchToHomeScreen={switchToHomeScreen}
          onColorsChange={updateColors}
          showKeybinds={preferences.showKeybinds ?? true}
          onShowKeybindsChange={setShowKeybinds}
          font={preferences.font ?? DEFAULT_FONT}
          onFontChange={setFont}
          fontSize={preferences.fontSize ?? DEFAULT_FONT_SIZE}
          onFontSizeChange={setFontSize}
        />
      )}
    </div>
  );
}

export default App;