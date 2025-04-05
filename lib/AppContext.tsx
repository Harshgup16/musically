import React, { createContext, useContext, useState, useEffect } from 'react';
import { Song } from '@/lib/supabase';
import { Playlist, playlistStorage } from '@/lib/playlistStorage';
import { 
  saveSongForOffline, 
  removeSongFromOffline, 
  getDownloadedSongs, 
  getLocalSongPath 
} from '@/lib/offlineStorage';
import { Audio, AVPlaybackStatus } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlayerStore } from './playerStore'; // Import playerStore

// Define the context type
interface AppContextType {
  downloadedSongs: Song[];
  favoriteSongs: string[];
  playlists: Playlist[];
  currentSong: Song | null;
  isPlaying: boolean;
  playbackPosition: number;
  duration: number;
  queue: Song[];
  isShuffle: boolean;
  isRepeat: boolean;
  addToDownloads: (song: Song) => Promise<void>;
  removeFromDownloads: (songId: string) => Promise<void>;
  toggleFavorite: (song: Song) => void;
  isSongDownloaded: (songId: string) => boolean;
  isSongFavorite: (songId: string) => boolean;
  loadPlaylists: () => Promise<void>;
  addSongToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  createPlaylist: (name: string) => Promise<Playlist>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  getLocalSongPath: (songId: string) => Promise<string | null>;
  loadAndPlaySong: (song: Song) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  handleNext: () => Promise<void>;
  handlePrevious: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  addToQueue: (song: Song) => void;
  removeFromQueue: (songId: string) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

// Create the context with default values
const AppContext = createContext<AppContextType>({
  downloadedSongs: [],
  favoriteSongs: [],
  playlists: [],
  currentSong: null,
  isPlaying: false,
  playbackPosition: 0,
  duration: 0,
  queue: [],
  isShuffle: false,
  isRepeat: false,
  addToDownloads: async () => {},
  removeFromDownloads: async () => {},
  toggleFavorite: () => {},
  isSongDownloaded: () => false,
  isSongFavorite: () => false,
  loadPlaylists: async () => {},
  addSongToPlaylist: async () => {},
  removeSongFromPlaylist: async () => {},
  createPlaylist: async () => ({ id: '', name: '', songs: [], createdAt: 0, updatedAt: 0 }),
  deletePlaylist: async () => {},
  getLocalSongPath: async () => null,
  loadAndPlaySong: async () => {},
  togglePlayPause: async () => {},
  handleNext: async () => {},
  handlePrevious: async () => {},
  seekTo: async () => {},
  addToQueue: () => {},
  removeFromQueue: () => {},
  toggleShuffle: () => {},
  toggleRepeat: () => {},
});

// Create a provider component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloadedSongs, setDownloadedSongs] = useState<Song[]>([]);
  const [favoriteSongs, setFavoriteSongs] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  
  // Use playerStore instead of managing our own audio
  const { 
    currentSong, 
    isPlaying, 
    playbackPosition, 
    duration,
    loadAndPlaySong: loadAndPlaySongFromPlayer,
    togglePlayPause: togglePlayPauseFromPlayer,
    handleNext: handleNextFromPlayer,
    handlePrevious: handlePreviousFromPlayer,
    seekTo: seekToFromPlayer
  } = usePlayerStore();
  
  const [queue, setQueue] = useState<Song[]>([]);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Load initial data from storage
  useEffect(() => {
    // Load playlists
    loadPlaylists();
    
    // Load downloaded songs
    loadDownloadedSongs();
    
    // Load queue
    loadQueue();
    
    // This would normally load from AsyncStorage
    // For now, we'll just initialize with empty arrays
    setFavoriteSongs([]);

    return () => {
      // No cleanup needed here, playerStore manages the audio instance
    };
  }, []);

  // Load queue from AsyncStorage
  const loadQueue = async () => {
    try {
      const queueData = await AsyncStorage.getItem('queue');
      if (queueData) {
        setQueue(JSON.parse(queueData));
      }
    } catch (error) {
      console.error('Error loading queue:', error);
    }
  };

  // Load downloaded songs from AsyncStorage
  const loadDownloadedSongs = async () => {
    try {
      const songs = await getDownloadedSongs();
      setDownloadedSongs(songs);
    } catch (error) {
      console.error('Error loading downloaded songs:', error);
    }
  };

  // Helper functions
  const addToDownloads = async (song: Song) => {
    try {
      // Save song to offline storage
      await saveSongForOffline(song);
      
      // Update state
      if (!downloadedSongs.some(s => s.id === song.id)) {
        setDownloadedSongs(prev => [...prev, song]);
      }
    } catch (error) {
      console.error('Error adding song to downloads:', error);
      throw error;
    }
  };

  const removeFromDownloads = async (songId: string) => {
    try {
      // Remove song from offline storage
      await removeSongFromOffline(songId);
      
      // Update state
      setDownloadedSongs(prev => prev.filter(song => song.id !== songId));
    } catch (error) {
      console.error('Error removing song from downloads:', error);
      throw error;
    }
  };

  const toggleFavorite = (song: Song) => {
    setFavoriteSongs(prev => {
      if (prev.includes(song.id)) {
        return prev.filter(id => id !== song.id);
      } else {
        return [...prev, song.id];
      }
    });
  };

  const isSongDownloaded = (songId: string) => {
    return downloadedSongs.some(song => song.id === songId);
  };

  const isSongFavorite = (songId: string) => {
    return favoriteSongs.includes(songId);
  };

  const loadPlaylists = async () => {
    try {
      const playlists = await playlistStorage.getAllPlaylists();
      setPlaylists(playlists);
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
  };

  const addSongToPlaylist = async (playlistId: string, song: Song) => {
    try {
      await playlistStorage.addSongToPlaylist(playlistId, song);
      await loadPlaylists();
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      throw error;
    }
  };

  const removeSongFromPlaylist = async (playlistId: string, songId: string) => {
    try {
      await playlistStorage.removeSongFromPlaylist(playlistId, songId);
      await loadPlaylists();
    } catch (error) {
      console.error('Error removing song from playlist:', error);
      throw error;
    }
  };

  const createPlaylist = async (name: string): Promise<Playlist> => {
    try {
      const newPlaylist: Playlist = {
        id: Date.now().toString(),
        name,
        songs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      await playlistStorage.savePlaylist(newPlaylist);
      await loadPlaylists();
      return newPlaylist;
    } catch (error) {
      console.error('Error creating playlist:', error);
      throw error;
    }
  };

  const deletePlaylist = async (playlistId: string): Promise<void> => {
    try {
      await playlistStorage.deletePlaylist(playlistId);
      await loadPlaylists();
    } catch (error) {
      console.error('Error deleting playlist:', error);
      throw error;
    }
  };

  // Playback functions now delegate to playerStore
  const loadAndPlaySong = async (song: Song) => {
    try {
      await loadAndPlaySongFromPlayer(song);
    } catch (error) {
      console.error('Error loading sound:', error);
    }
  };

  const togglePlayPause = async () => {
    await togglePlayPauseFromPlayer();
  };

  const seekTo = async (position: number) => {
    await seekToFromPlayer(position);
  };

  const handleNext = async () => {
    await handleNextFromPlayer();
  };

  const handlePrevious = async () => {
    await handlePreviousFromPlayer();
  };

  const addToQueue = (song: Song) => {
    setQueue(prev => {
      const newQueue = [...prev, song];
      saveQueue();
      return newQueue;
    });
  };

  const removeFromQueue = (songId: string) => {
    setQueue(prev => {
      const newQueue = prev.filter(song => song.id !== songId);
      saveQueue();
      return newQueue;
    });
  };

  const toggleShuffle = () => {
    setIsShuffle(prev => !prev);
  };

  const toggleRepeat = () => {
    setIsRepeat(prev => !prev);
  };

  // Save queue to AsyncStorage
  const saveQueue = async () => {
    try {
      await AsyncStorage.setItem('queue', JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  };

  // Provide the context value
  const contextValue: AppContextType = {
    downloadedSongs,
    favoriteSongs,
    playlists,
    currentSong,
    isPlaying,
    playbackPosition,
    duration,
    queue,
    isShuffle,
    isRepeat,
    addToDownloads,
    removeFromDownloads,
    toggleFavorite,
    isSongDownloaded,
    isSongFavorite,
    loadPlaylists,
    addSongToPlaylist,
    removeSongFromPlaylist,
    createPlaylist,
    deletePlaylist,
    getLocalSongPath,
    loadAndPlaySong,
    togglePlayPause,
    handleNext,
    handlePrevious,
    seekTo,
    addToQueue,
    removeFromQueue,
    toggleShuffle,
    toggleRepeat,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext); 