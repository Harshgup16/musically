import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from './supabase';

export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
  createdAt: number;
  updatedAt: number;
}

const PLAYLISTS_STORAGE_KEY = '@musitune:playlists';

export const playlistStorage = {
  async getAllPlaylists(): Promise<Playlist[]> {
    try {
      const playlistsJson = await AsyncStorage.getItem(PLAYLISTS_STORAGE_KEY);
      return playlistsJson ? JSON.parse(playlistsJson) : [];
    } catch (error) {
      console.error('Error getting playlists:', error);
      return [];
    }
  },

  async savePlaylist(playlist: Playlist): Promise<Playlist> {
    try {
      const playlists = await this.getAllPlaylists();
      const existingIndex = playlists.findIndex(p => p.id === playlist.id);
      
      if (existingIndex >= 0) {
        playlists[existingIndex] = playlist;
      } else {
        playlists.push(playlist);
      }
      
      await AsyncStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
      return playlist;
    } catch (error) {
      console.error('Error saving playlist:', error);
      throw error;
    }
  },

  async deletePlaylist(playlistId: string): Promise<void> {
    try {
      const playlists = await this.getAllPlaylists();
      const filteredPlaylists = playlists.filter(p => p.id !== playlistId);
      await AsyncStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(filteredPlaylists));
    } catch (error) {
      console.error('Error deleting playlist:', error);
      throw error;
    }
  },

  async addSongToPlaylist(playlistId: string, song: Song): Promise<void> {
    try {
      const playlists = await this.getAllPlaylists();
      const playlistIndex = playlists.findIndex(p => p.id === playlistId);
      
      if (playlistIndex === -1) {
        throw new Error('Playlist not found');
      }
      
      const playlist = playlists[playlistIndex];
      
      // Check if the song already exists in the playlist
      const songExists = playlist.songs.some(s => s.id === song.id);
      
      if (!songExists) {
        playlist.songs.push(song);
        playlist.updatedAt = Date.now();
        await AsyncStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
      }
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      throw error;
    }
  },

  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
    try {
      const playlists = await this.getAllPlaylists();
      const playlistIndex = playlists.findIndex(p => p.id === playlistId);
      
      if (playlistIndex === -1) {
        throw new Error('Playlist not found');
      }
      
      const playlist = playlists[playlistIndex];
      playlist.songs = playlist.songs.filter(s => s.id !== songId);
      playlist.updatedAt = Date.now();
      await AsyncStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
    } catch (error) {
      console.error('Error removing song from playlist:', error);
      throw error;
    }
  }
}; 