import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from '@/lib/supabase';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useQueueStore } from './queueStore';

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  playbackPosition: number;
  duration: number;
  sound: Audio.Sound | null;
  isLoading: boolean;
  error: string | null;
  loadAndPlaySong: (song: Song) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  handleNext: () => Promise<void>;
  handlePrevious: () => Promise<void>;
  setupAudio: () => Promise<void>;
  loadLastPlayedState: () => Promise<void>;
  saveLastPlayedState: () => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  playbackPosition: 0,
  duration: 0,
  sound: null,
  isLoading: false,
  error: null,

  setupAudio: async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Error setting up audio:', error);
      set({ error: 'Failed to initialize audio. Please restart the app.' });
    }
  },

  loadLastPlayedState: async () => {
    try {
      const lastPlayedData = await AsyncStorage.getItem('lastPlayed');
      if (lastPlayedData) {
        const { song, position, isPlaying: wasPlaying } = JSON.parse(lastPlayedData);
        set({ 
          currentSong: song,
          playbackPosition: position,
          isPlaying: wasPlaying
        });

        // Load and play the last song
        if (song) {
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: song.url },
            { shouldPlay: wasPlaying },
            (status: AVPlaybackStatus) => {
              if (status.isLoaded) {
                set({ 
                  playbackPosition: status.positionMillis,
                  duration: status.durationMillis || 0
                });

                // Handle song completion
                if (status.didJustFinish) {
                  const { isRepeat } = useQueueStore.getState();
                  if (isRepeat) {
                    // Replay the same song
                    newSound.replayAsync();
                  } else {
                    // Play next song
                    get().handleNext();
                  }
                }
              }
            }
          );

          // Set up the sound to update position as it plays
          newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
            if (status.isLoaded) {
              set({ 
                playbackPosition: status.positionMillis,
                duration: status.durationMillis || 0
              });
            }
          });

          set({ sound: newSound });
          
          // If the song was playing when the app was closed, seek to the last position
          if (wasPlaying && position > 0) {
            await newSound.setPositionAsync(position);
          }
        }
      }
    } catch (error) {
      console.error('Error loading last played state:', error);
    }
  },

  saveLastPlayedState: async () => {
    const { currentSong, playbackPosition, isPlaying } = get();
    if (!currentSong) return;
    
    // Execute in background - don't block the UI with AsyncStorage
    setTimeout(() => {
      AsyncStorage.setItem('lastPlayed', JSON.stringify({
        song: currentSong,
        position: playbackPosition,
        isPlaying,
      })).catch(error => {
        console.error('Error saving last played state:', error);
      });
    }, 0);
  },

  loadAndPlaySong: async (song: Song) => {
    try {
      // Update UI state immediately for better perceived performance
      set({ 
        isLoading: true, 
        error: null,
        currentSong: song,
        isPlaying: true
      });
      
      const { sound } = get();
      
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: song.url },
        { shouldPlay: true },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            set({ 
              playbackPosition: status.positionMillis,
              duration: status.durationMillis || 0
            });

            // Handle song completion
            if (status.didJustFinish) {
              const { isRepeat } = useQueueStore.getState();
              if (isRepeat) {
                // Replay the same song
                newSound.replayAsync();
              } else {
                // Play next song
                get().handleNext();
              }
            }
          }
        }
      );

      // Set up the sound to update position as it plays
      newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded) {
          set({ 
            playbackPosition: status.positionMillis,
            duration: status.durationMillis || 0
          });
        }
      });

      set({ 
        sound: newSound,
        isLoading: false
      });
      
      // Save state in the background
      get().saveLastPlayedState();
    } catch (error) {
      console.error('Error loading sound:', error);
      set({ 
        error: 'Failed to play the song. Please try again.',
        isLoading: false,
        isPlaying: false
      });
    }
  },

  togglePlayPause: async () => {
    const { sound, currentSong, isPlaying } = get();
    if (!sound || !currentSong) return;

    // Update UI state immediately for instant feedback
    const newPlayingState = !isPlaying;
    set({ isPlaying: newPlayingState });
    
    // Fire and forget - don't await the audio operations
    // This prevents UI lag while audio system responds
    if (newPlayingState) {
      sound.playAsync().catch(error => {
        console.error('Error playing audio:', error);
        // Only revert UI state if there's an error
        set({ isPlaying: isPlaying });
      });
    } else {
      sound.pauseAsync().catch(error => {
        console.error('Error pausing audio:', error);
        // Only revert UI state if there's an error
        set({ isPlaying: isPlaying });
      });
    }
    
    // Save state in the background
    get().saveLastPlayedState();
  },

  seekTo: async (position: number) => {
    const { sound } = get();
    if (!sound) return;
    
    try {
      await sound.setPositionAsync(position);
      set({ playbackPosition: position });
      get().saveLastPlayedState();
    } catch (error) {
      console.error('Error seeking:', error);
    }
  },

  handleNext: async () => {
    const { currentSong } = get();
    const nextSong = useQueueStore.getState().getNextSong(currentSong);
    if (nextSong) {
      await get().loadAndPlaySong(nextSong);
    }
  },

  handlePrevious: async () => {
    const { currentSong } = get();
    const previousSong = useQueueStore.getState().getPreviousSong(currentSong);
    if (previousSong) {
      await get().loadAndPlaySong(previousSong);
    }
  },
})); 