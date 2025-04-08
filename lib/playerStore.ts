import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from '@/lib/supabase';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useQueueStore } from './queueStore';
import { AppState, AppStateStatus } from 'react-native';
import { ref, set as firebaseSet, onValue, off } from 'firebase/database';
import { database } from './firebase';

// Track if we're in a room
let currentRoomId: string | null = null;

// Function to set the current room ID
export const setCurrentRoomId = (roomId: string | null) => {
  currentRoomId = roomId;
};

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  playbackPosition: number;
  duration: number;
  sound: Audio.Sound | null;
  isLoading: boolean;
  error: string | null;
  appState: AppStateStatus;
  loadAndPlaySong: (song: Song) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  handleNext: () => Promise<void>;
  handlePrevious: () => Promise<void>;
  setupAudio: () => Promise<void>;
  loadLastPlayedState: () => Promise<void>;
  saveLastPlayedState: () => Promise<void>;
  handleAppStateChange: (nextAppState: AppStateStatus) => void;
  updateRoomPlayback: (roomId: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  playbackPosition: 0,
  duration: 0,
  sound: null,
  isLoading: false,
  error: null,
  appState: AppState.currentState,

  setupAudio: async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Listen for app state changes
      AppState.addEventListener('change', get().handleAppStateChange);
      
    } catch (error) {
      console.error('Error setting up audio:', error);
      set({ error: 'Failed to initialize audio. Please restart the app.' });
    }
  },
  
  handleAppStateChange: async (nextAppState: AppStateStatus) => {
    const previousState = get().appState;
    set({ appState: nextAppState });
    
    console.log(`App state changed from ${previousState} to ${nextAppState}`);
    
    if (previousState === 'active' && nextAppState.match(/inactive|background/)) {
      // App is going to background
      console.log('App going to background, saving state');
      const { sound, currentSong, isPlaying, playbackPosition } = get();
      if (sound && currentSong && isPlaying) {
        // Update our last position before going to background
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          set({ playbackPosition: status.positionMillis });
          get().saveLastPlayedState();
        }
      }
    } else if (previousState.match(/inactive|background/) && nextAppState === 'active') {
      // App is coming to foreground
      console.log('App coming to foreground, updating state');
      const { sound, currentSong, isPlaying } = get();
      if (sound && currentSong) {
        // Get the latest status
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          // Update our position
          set({ 
            playbackPosition: status.positionMillis,
            duration: status.durationMillis || 0,
            isPlaying: status.isPlaying
          });
          
          // Check if song should be playing but isn't
          if (isPlaying && !status.isPlaying) {
            sound.playAsync();
          }
          
          // Check if song has finished while in background
          if (status.didJustFinish || 
              (status.positionMillis > 0 && 
               status.durationMillis && 
               status.positionMillis >= status.durationMillis - 500)) {
            console.log('Song appears to have finished while in background');
            get().handleNext();
          }
        }
      }
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
            { 
              shouldPlay: wasPlaying,
              progressUpdateIntervalMillis: 300, // More frequent updates for smoother UI
            },
            (status: AVPlaybackStatus) => {
              if (status.isLoaded) {
                set({ 
                  playbackPosition: status.positionMillis,
                  duration: status.durationMillis || 0
                });

                // Handle song completion
                if (status.didJustFinish) {
                  console.log('Song finished playing naturally, handling next song');
                  const { isRepeat } = useQueueStore.getState();
                  if (isRepeat) {
                    // Replay the same song
                    newSound.replayAsync().catch(err => 
                      console.error('Error replaying song:', err)
                    );
                  } else {
                    // Play next song
                    setTimeout(() => {
                      get().handleNext().catch(err => 
                        console.error('Error playing next song:', err)
                      );
                    }, 300);
                  }
                }
              }
            }
          );

          // Set up a more comprehensive playback status check
          let lastPosition = 0;
          let stuckCounter = 0;
          
          newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
            if (status.isLoaded) {
              const currentPosition = status.positionMillis;
              const currentDuration = status.durationMillis || 0;
              
              set({ 
                playbackPosition: currentPosition,
                duration: currentDuration,
                isPlaying: status.isPlaying
              });

              // Check for stuck playback
              if (status.isPlaying && currentPosition === lastPosition && currentPosition > 0) {
                stuckCounter++;
                
                // If position is stuck for several checks and we're near the end, consider it finished
                if (stuckCounter >= 3 && currentDuration > 0 && 
                    currentPosition >= currentDuration - 3000) {
                  console.log('Playback appears stuck near the end, moving to next song');
                  stuckCounter = 0;
                  
                  const { isRepeat } = useQueueStore.getState();
                  if (isRepeat) {
                    newSound.replayAsync().catch(err => 
                      console.error('Error replaying stuck song:', err)
                    );
                  } else {
                    get().handleNext().catch(err => 
                      console.error('Error playing next after stuck song:', err)
                    );
                  }
                }
              } else {
                stuckCounter = 0;
              }
              
              // Double-check for song completion
              if (status.didJustFinish || 
                  (currentPosition > 0 && currentDuration > 0 && 
                   currentPosition >= currentDuration - 1000 && !status.isPlaying)) {
                console.log('Song completion detected in status update');
                const { isRepeat } = useQueueStore.getState();
                if (isRepeat) {
                  // Replay the same song
                  newSound.replayAsync().catch(err => 
                    console.error('Error replaying completed song:', err)
                  );
                } else {
                  // Play next song
                  get().handleNext().catch(err => 
                    console.error('Error playing next after completion:', err)
                  );
                }
              }
              
              lastPosition = currentPosition;
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
        { 
          shouldPlay: true,
          progressUpdateIntervalMillis: 300, // More frequent updates for smoother UI
        },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            set({ 
              playbackPosition: status.positionMillis,
              duration: status.durationMillis || 0
            });

            // Update Firebase if we're in a room
            if (currentRoomId) {
              const roomRef = ref(database, `rooms/${currentRoomId}`);
              const updateData = {
                currentSong: {
                  url: song.url,
                  title: song.title,
                  artist: song.artist,
                },
                isPlaying: true,
                currentTime: status.positionMillis,
                lastUpdated: Date.now(),
              };
              
              firebaseSet(roomRef, updateData).catch((error: Error) => 
                console.error('Error updating room playback:', error)
              );
            }

            // Handle song completion - this is called when a song naturally finishes
            if (status.didJustFinish) {
              console.log('Song finished playing naturally, handling next song');
              const { isRepeat } = useQueueStore.getState();
              if (isRepeat) {
                // Replay the same song
                newSound.replayAsync().catch(err => 
                  console.error('Error replaying song:', err)
                );
              } else {
                // Play next song - use a small delay to ensure smooth transition
                setTimeout(() => {
                  get().handleNext().catch(err => 
                    console.error('Error playing next song:', err)
                  );
                }, 300);
              }
            }
          }
        }
      );

      // Set up a more comprehensive playback status check to ensure we catch song completion
      let lastPosition = 0;
      let stuckCounter = 0;
      
      newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded) {
          const currentPosition = status.positionMillis;
          const currentDuration = status.durationMillis || 0;
          
          set({ 
            playbackPosition: currentPosition,
            duration: currentDuration,
            isPlaying: status.isPlaying
          });

          // Check for stuck playback (position not changing when it should be playing)
          if (status.isPlaying && currentPosition === lastPosition && currentPosition > 0) {
            stuckCounter++;
            console.log(`Playback position stuck at ${currentPosition}ms, counter: ${stuckCounter}`);
            
            // If position is stuck for several checks and we're near the end, consider it finished
            if (stuckCounter >= 3 && currentDuration > 0 && 
                currentPosition >= currentDuration - 3000) {
              console.log('Playback appears stuck near the end, moving to next song');
              stuckCounter = 0;
              
              const { isRepeat } = useQueueStore.getState();
              if (isRepeat) {
                newSound.replayAsync().catch(err => 
                  console.error('Error replaying stuck song:', err)
                );
              } else {
                get().handleNext().catch(err => 
                  console.error('Error playing next after stuck song:', err)
                );
              }
            }
          } else {
            stuckCounter = 0;
          }
          
          // Double-check for song completion
          if (status.didJustFinish || 
              (currentPosition > 0 && currentDuration > 0 && 
               currentPosition >= currentDuration - 1000 && !status.isPlaying)) {
            console.log('Song completion detected in status update');
            const { isRepeat } = useQueueStore.getState();
            if (isRepeat) {
              // Replay the same song
              newSound.replayAsync().catch(err => 
                console.error('Error replaying completed song:', err)
              );
            } else {
              // Play next song
              get().handleNext().catch(err => 
                console.error('Error playing next after completion:', err)
              );
            }
          }
          
          lastPosition = currentPosition;
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
    try {
      const { sound, isPlaying, currentSong } = get();
      
      if (!sound || !currentSong) return;
      
      if (isPlaying) {
        await sound.pauseAsync();
        set({ isPlaying: false });
        
        // Update Firebase if we're in a room
        if (currentRoomId) {
          const roomRef = ref(database, `rooms/${currentRoomId}`);
          const updateData = {
            isPlaying: false,
            lastUpdated: Date.now(),
          };
          
          firebaseSet(roomRef, updateData).catch((error: Error) => 
            console.error('Error updating room playback state:', error)
          );
        }
      } else {
        await sound.playAsync();
        set({ isPlaying: true });
        
        // Update Firebase if we're in a room
        if (currentRoomId) {
          const roomRef = ref(database, `rooms/${currentRoomId}`);
          const updateData = {
            isPlaying: true,
            lastUpdated: Date.now(),
          };
          
          firebaseSet(roomRef, updateData).catch((error: Error) => 
            console.error('Error updating room playback state:', error)
          );
        }
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
      set({ error: 'Failed to toggle playback' });
    }
  },

  seekTo: async (position: number) => {
    try {
      const { sound, currentSong } = get();
      
      if (!sound || !currentSong) return;
      
      await sound.setPositionAsync(position);
      set({ playbackPosition: position });
      
      // Update Firebase if we're in a room
      if (currentRoomId) {
        const roomRef = ref(database, `rooms/${currentRoomId}`);
        const updateData = {
          currentTime: position,
          lastUpdated: Date.now(),
        };
        
        firebaseSet(roomRef, updateData).catch((error: Error) => 
          console.error('Error updating room playback position:', error)
        );
      }
    } catch (error) {
      console.error('Error seeking:', error);
      set({ error: 'Failed to seek' });
    }
  },

  handleNext: async () => {
    try {
      const { currentSong } = get();
      const nextSong = useQueueStore.getState().getNextSong(currentSong);
      
      console.log('Handling next song:', nextSong ? nextSong.title : 'No next song');
      
      if (nextSong) {
        // Pre-update UI state for immediate feedback
        set({ 
          isLoading: true,
          currentSong: nextSong 
        });
        
        await get().loadAndPlaySong(nextSong);
      } else {
        // If no next song, just stop
        const { sound } = get();
        if (sound) {
          await sound.pauseAsync();
          await sound.setPositionAsync(0);
          set({ 
            isPlaying: false,
            playbackPosition: 0
          });
          
          // Update Firebase if we're in a room
          if (currentRoomId) {
            const roomRef = ref(database, `rooms/${currentRoomId}`);
            const updateData = {
              isPlaying: false,
              currentTime: 0,
              lastUpdated: Date.now(),
            };
            
            firebaseSet(roomRef, updateData).catch((error: Error) => 
              console.error('Error updating room playback state:', error)
            );
          }
        }
      }
    } catch (error) {
      console.error('Error handling next song:', error);
    }
  },

  handlePrevious: async () => {
    const { currentSong } = get();
    const previousSong = useQueueStore.getState().getPreviousSong(currentSong);
    if (previousSong) {
      await get().loadAndPlaySong(previousSong);
    }
  },

  // New method to update room playback
  updateRoomPlayback: async (roomId: string) => {
    try {
      const { currentSong, isPlaying, playbackPosition } = get();
      
      if (!currentSong) return;
      
      const roomRef = ref(database, `rooms/${roomId}`);
      const updateData = {
        currentSong: {
          url: currentSong.url,
          title: currentSong.title,
          artist: currentSong.artist,
        },
        isPlaying,
        currentTime: playbackPosition,
        lastUpdated: Date.now(),
      };
      
      firebaseSet(roomRef, updateData).catch((error: Error) => 
        console.error('Error updating room playback:', error)
      );
    } catch (error) {
      console.error('Error updating room playback:', error);
    }
  },

  // New method to join a room
  joinRoom: async (roomId: string) => {
    try {
      // Set the current room ID
      setCurrentRoomId(roomId);
      
      // Get room data from Firebase
      const roomRef = ref(database, `rooms/${roomId}`);
      
      // Listen for room updates
      onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) {
          console.log("Room data not found");
          return;
        }
        
        const { currentSong, isPlaying, currentTime, lastUpdated } = roomData;
        
        // Add comprehensive null check for currentSong and its properties
        if (currentSong && typeof currentSong === 'object' && 
            'url' in currentSong && typeof currentSong.url === 'string' && 
            'title' in currentSong && typeof currentSong.title === 'string' && 
            'artist' in currentSong && typeof currentSong.artist === 'string') {
          
          // Check if we need to load a new song (either no current song or different URL)
          const currentPlayerSong = get().currentSong;
          if (!currentPlayerSong || currentPlayerSong.url !== currentSong.url) {
            // At this point, we know currentSong is not null and has the required properties
            const songData = currentSong as { url: string; title: string; artist: string; cover_url?: string; duration?: number };
            const song: Song = {
              id: Date.now().toString(), // Generate a temporary ID
              url: songData.url,
              title: songData.title,
              artist: songData.artist,
              cover_url: songData.cover_url || '',
              duration: songData.duration || 0,
              created_at: new Date().toISOString(),
            };
            
            console.log(`Loading new song in room: ${song.title} by ${song.artist}`);
            void get().loadAndPlaySong(song);
          }
        } else {
          console.log("Current song data invalid or incomplete", currentSong);
        }
        
        // If the playback state is different, update it
        const playerState = get();
        if (isPlaying !== undefined && isPlaying !== playerState.isPlaying) {
          const { sound } = playerState;
          if (sound) {
            if (isPlaying) {
              console.log("Syncing room - playing");
              void sound.playAsync();
            } else {
              console.log("Syncing room - pausing");
              void sound.pauseAsync();
            }
            set({ isPlaying });
          }
        }
        
        // If the position is significantly different, seek to it
        if (currentTime !== undefined && Math.abs(currentTime - playerState.playbackPosition) > 1000) {
          const { sound } = playerState;
          if (sound) {
            console.log(`Syncing room - seeking to ${currentTime}ms`);
            void sound.setPositionAsync(currentTime);
            set({ playbackPosition: currentTime });
          }
        }
      });
    } catch (error) {
      console.error('Error joining room:', error);
      set({ error: 'Failed to join room' });
    }
  },

  // New method to leave a room
  leaveRoom: () => {
    // Remove the Firebase listener
    if (currentRoomId) {
      const roomRef = ref(database, `rooms/${currentRoomId}`);
      off(roomRef);
      setCurrentRoomId(null);
    }
  },
})); 