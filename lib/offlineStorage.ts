import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system';

// Key for storing downloaded songs in AsyncStorage
const DOWNLOADED_SONGS_KEY = 'downloaded_songs';

// Directory for storing downloaded song files
const DOWNLOAD_DIRECTORY = `${FileSystem.documentDirectory}downloads/`;

/**
 * Ensures the download directory exists
 */
export const ensureDownloadDirectory = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIRECTORY);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIRECTORY, { intermediates: true });
  }
};

/**
 * Saves a song to AsyncStorage and downloads the audio file
 */
export const saveSongForOffline = async (song: Song): Promise<void> => {
  try {
    // Ensure download directory exists
    await ensureDownloadDirectory();
    
    // Get existing downloaded songs
    const existingSongs = await getDownloadedSongs();
    
    // Check if song is already downloaded
    if (existingSongs.some(s => s.id === song.id)) {
      console.log('Song already downloaded:', song.title);
      return;
    }
    
    // Download the audio file
    const fileName = `${song.id}.mp3`;
    const filePath = `${DOWNLOAD_DIRECTORY}${fileName}`;
    
    // Add a delay to simulate download time (for testing purposes)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Download the file
    const downloadResult = await FileSystem.downloadAsync(
      song.url,
      filePath
    );
    
    if (downloadResult.status !== 200) {
      throw new Error(`Failed to download song: ${downloadResult.status}`);
    }
    
    // Add the song to the downloaded songs list
    const updatedSongs = [...existingSongs, song];
    await AsyncStorage.setItem(DOWNLOADED_SONGS_KEY, JSON.stringify(updatedSongs));
    
    console.log('Song downloaded successfully:', song.title);
  } catch (error) {
    console.error('Error saving song for offline:', error);
    throw error;
  }
};

/**
 * Removes a song from offline storage
 */
export const removeSongFromOffline = async (songId: string): Promise<void> => {
  try {
    // Get existing downloaded songs
    const existingSongs = await getDownloadedSongs();
    
    // Find the song to remove
    const songToRemove = existingSongs.find(s => s.id === songId);
    if (!songToRemove) {
      console.log('Song not found in downloads:', songId);
      return;
    }
    
    // Remove the audio file
    const fileName = `${songId}.mp3`;
    const filePath = `${DOWNLOAD_DIRECTORY}${fileName}`;
    
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(filePath);
    }
    
    // Update the downloaded songs list
    const updatedSongs = existingSongs.filter(s => s.id !== songId);
    await AsyncStorage.setItem(DOWNLOADED_SONGS_KEY, JSON.stringify(updatedSongs));
    
    console.log('Song removed from downloads:', songToRemove.title);
  } catch (error) {
    console.error('Error removing song from offline:', error);
    throw error;
  }
};

/**
 * Gets all downloaded songs from AsyncStorage
 */
export const getDownloadedSongs = async (): Promise<Song[]> => {
  try {
    const songsJson = await AsyncStorage.getItem(DOWNLOADED_SONGS_KEY);
    return songsJson ? JSON.parse(songsJson) : [];
  } catch (error) {
    console.error('Error getting downloaded songs:', error);
    return [];
  }
};

/**
 * Gets the local file path for a downloaded song
 */
export const getLocalSongPath = async (songId: string): Promise<string | null> => {
  try {
    const fileName = `${songId}.mp3`;
    const filePath = `${DOWNLOAD_DIRECTORY}${fileName}`;
    
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    return fileInfo.exists ? filePath : null;
  } catch (error) {
    console.error('Error getting local song path:', error);
    return null;
  }
};

/**
 * Checks if a song is downloaded
 */
export const isSongDownloaded = async (songId: string): Promise<boolean> => {
  try {
    const songs = await getDownloadedSongs();
    return songs.some(s => s.id === songId);
  } catch (error) {
    console.error('Error checking if song is downloaded:', error);
    return false;
  }
}; 