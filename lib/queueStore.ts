import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from '@/lib/supabase';

interface QueueState {
  queue: Song[];
  isShuffle: boolean;
  isRepeat: boolean;
  currentPlaylistId: string | null;
  addToQueue: (songs: Song[]) => Promise<void>;
  removeFromQueue: (songId: string) => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  getNextSong: (currentSong: Song | null) => Song | null;
  getPreviousSong: (currentSong: Song | null) => Song | null;
  loadQueue: () => Promise<void>;
  clearQueue: () => Promise<void>;
  setCurrentPlaylistId: (id: string | null) => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  isShuffle: false,
  isRepeat: false,
  currentPlaylistId: null,

  loadQueue: async () => {
    try {
      const savedQueue = await AsyncStorage.getItem('queue');
      if (savedQueue) {
        const parsedQueue = JSON.parse(savedQueue);
        // Validate that all songs in the queue have the required properties
        const validQueue = parsedQueue.filter((song: Song) => song && song.id && song.title);
        set({ queue: validQueue });
      }
    } catch (error) {
      console.error('Error loading queue:', error);
    }
  },

  addToQueue: async (songs) => {
    const currentQueue = get().queue;
    // Filter out any songs that don't have the required properties
    const validSongs = songs.filter(song => song && song.id && song.title);
    if (validSongs.length === 0) {
      console.warn('No valid songs to add to queue');
      return;
    }
    
    // Filter out songs that are already in the queue
    const newSongs = validSongs.filter(song => 
      !currentQueue.some(existingSong => existingSong.id === song.id)
    );
    
    if (newSongs.length === 0) {
      console.warn('All songs are already in the queue');
      return;
    }
    
    const newQueue = [...currentQueue, ...newSongs];
    try {
      await AsyncStorage.setItem('queue', JSON.stringify(newQueue));
      set({ queue: newQueue });
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  },

  removeFromQueue: async (songId) => {
    const currentQueue = get().queue;
    const newQueue = currentQueue.filter((song) => song.id !== songId);
    try {
      await AsyncStorage.setItem('queue', JSON.stringify(newQueue));
      set({ queue: newQueue });
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  },

  clearQueue: async () => {
    try {
      await AsyncStorage.setItem('queue', JSON.stringify([]));
      set({ queue: [] });
    } catch (error) {
      console.error('Error clearing queue:', error);
    }
  },

  setCurrentPlaylistId: (id) => {
    set({ currentPlaylistId: id });
  },

  toggleShuffle: () => {
    set((state) => ({
      isShuffle: !state.isShuffle,
    }));
  },

  toggleRepeat: () => {
    set((state) => ({
      isRepeat: !state.isRepeat,
    }));
  },

  getNextSong: (currentSong) => {
    const { queue, isShuffle, isRepeat, currentPlaylistId } = get();

    if (queue.length === 0) return null;

    if (isRepeat) {
      return currentSong || null;
    }

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      return queue[randomIndex];
    }

    const currentIndex = queue.findIndex((song) => song.id === currentSong?.id);
    if (currentIndex === -1) return queue[0];
    if (currentIndex === queue.length - 1) {
      // If we're in a playlist and at the end, loop back to the beginning
      if (currentPlaylistId) {
        return queue[0];
      }
      return null;
    }
    return queue[currentIndex + 1];
  },

  getPreviousSong: (currentSong) => {
    const { queue, isShuffle, isRepeat, currentPlaylistId } = get();

    if (queue.length === 0) return null;

    if (isRepeat) {
      return currentSong || null;
    }

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      return queue[randomIndex];
    }

    const currentIndex = queue.findIndex((song) => song.id === currentSong?.id);
    if (currentIndex === -1) return queue[0];
    if (currentIndex === 0) {
      // If we're in a playlist and at the beginning, loop to the end
      if (currentPlaylistId) {
        return queue[queue.length - 1];
      }
      return null;
    }
    return queue[currentIndex - 1];
  },
})); 