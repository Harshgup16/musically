import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, Share } from 'react-native';
import { router } from 'expo-router';
import { ref, set, push, get as firebaseGet, onValue, off } from 'firebase/database';
import { database } from '../../lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '@/lib/playerStore';
import { useQueueStore } from '@/lib/queueStore';
import { useAppContext } from '@/lib/AppContext';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

export default function CreateScreen() {
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'join' | 'room'>('create');
  const [isLoading, setIsLoading] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Use the player store
  const { 
    currentSong,
    isPlaying,
    playbackPosition,
    duration,
    loadAndPlaySong,
    togglePlayPause,
    handleNext,
    handlePrevious,
    seekTo,
    joinRoom: joinRoomFromStore,
    leaveRoom
  } = usePlayerStore();

  // Use the queue store
  const {
    queue,
    isShuffle,
    isRepeat
  } = useQueueStore();

  // Check for active room on component mount and tab focus
  useFocusEffect(
    React.useCallback(() => {
      checkActiveRoom();
      return () => {};
    }, [])
  );

  const checkActiveRoom = async () => {
    try {
      const savedRoomId = await AsyncStorage.getItem('lastRoomId');
      if (savedRoomId) {
        setCurrentRoomId(savedRoomId);
        setRoomCode(savedRoomId);
        setupRoomListener(savedRoomId);
        setActiveTab('room');
      }
    } catch (error) {
      console.error('Error checking active room:', error);
    }
  };

  const setupRoomListener = (roomId: string) => {
    if (!roomId) return;
    
    // Set up Firebase listener to get room data
    const roomRef = ref(database, `rooms/${roomId}`);
    
    const roomListener = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRoomData(data);
        setIsLoading(false);
      } else {
        setError('Room not found');
        setIsLoading(false);
      }
    }, (error) => {
      console.error('Error loading room data:', error);
      setError('Failed to load room data');
      setIsLoading(false);
    });

    // Join the room using the player store
    joinRoomFromStore(roomId);
    
    // Save room ID for persistence
    AsyncStorage.setItem('lastRoomId', roomId);
    AsyncStorage.setItem('lastRoomName', roomData?.name || 'Music Room');
    
    return () => {
      off(roomRef, 'value', roomListener);
    };
  };

  const createRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Error', 'Please enter a room name');
      return;
    }

    if (!currentSong) {
      Alert.alert('Error', 'Please select a song to play');
      return;
    }

    try {
      setIsLoading(true);
      const roomsRef = ref(database, 'rooms');
      const newRoomRef = push(roomsRef);
      const roomId = newRoomRef.key;
      
      await set(newRoomRef, {
        name: roomName,
        currentSong: {
          url: currentSong.url,
          title: currentSong.title,
          artist: currentSong.artist,
        },
        isPlaying: isPlaying,
        currentTime: playbackPosition,
        createdAt: Date.now(),
      });
      
      // Set up room listener and update UI
      setCurrentRoomId(roomId);
      setupRoomListener(roomId!);
      setActiveTab('room');
      
      // Save room info for persistence
      await AsyncStorage.setItem('lastRoomId', roomId!);
      await AsyncStorage.setItem('lastRoomName', roomName);
      
    } catch (error) {
      Alert.alert('Error', 'Failed to create room');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      Alert.alert('Error', 'Please enter a room code');
      return;
    }

    try {
      setIsLoading(true);
      
      // Check if the room exists
      const roomRef = ref(database, `rooms/${roomCode}`);
      const snapshot = await firebaseGet(roomRef);
      
      if (!snapshot.exists()) {
        Alert.alert('Error', 'Room not found. Please check the room code and try again.');
        setIsLoading(false);
        return;
      }
      
      // Set up room listener and update UI
      setCurrentRoomId(roomCode);
      setupRoomListener(roomCode);
      setActiveTab('room');
      
    } catch (error) {
      console.error('Error joining room:', error);
      Alert.alert('Error', 'Failed to join room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom();
      await AsyncStorage.removeItem('lastRoomId');
      await AsyncStorage.removeItem('lastRoomName');
      setCurrentRoomId(null);
      setRoomData(null);
      setActiveTab('create');
    } catch (error) {
      console.error('Error leaving room:', error);
      setError('Failed to leave room. Please try again.');
    }
  };

  const shareRoomCode = async () => {
    if (!currentRoomId) return;
    
    try {
      await Share.share({
        message: `Join my music room! Room code: ${currentRoomId}`,
        title: 'Join Music Room',
      });
    } catch (error) {
      console.error('Error sharing room code:', error);
    }
  };

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <LinearGradient
      colors={['#121212', '#1a1a1a', '#121212']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          {activeTab === 'room' ? (
            <>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={handleLeaveRoom}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{roomData?.name || 'Music Room'}</Text>
              <TouchableOpacity 
                style={styles.shareButton}
                onPress={shareRoomCode}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Music Rooms</Text>
            </>
          )}
        </View>

        {activeTab !== 'room' && (
          <View style={styles.tabContainer}>
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'create' && styles.activeTab]}
              onPress={() => setActiveTab('create')}>
              <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>
                Create Room
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'join' && styles.activeTab]}
              onPress={() => setActiveTab('join')}>
              <Text style={[styles.tabText, activeTab === 'join' && styles.activeTabText]}>
                Join Room
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'create' && (
          <View style={styles.formContainer}>
            <Text style={styles.label}>Room Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter room name"
              placeholderTextColor="#b3b3b3"
              value={roomName}
              onChangeText={setRoomName}
            />
            
            <Text style={styles.label}>Current Song</Text>
            {currentSong ? (
              <View style={styles.currentSongContainer}>
                <Text style={styles.songTitle}>{currentSong.title}</Text>
                <Text style={styles.songArtist}>{currentSong.artist}</Text>
              </View>
            ) : (
              <Text style={styles.noSongText}>No song selected</Text>
            )}
            
            <TouchableOpacity 
              style={styles.createButton} 
              onPress={createRoom}
              disabled={isLoading}>
              <Text style={styles.createButtonText}>
                {isLoading ? 'Creating...' : 'Create Room'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'join' && (
          <View style={styles.formContainer}>
            <Text style={styles.label}>Room Code</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter room code"
              placeholderTextColor="#b3b3b3"
              value={roomCode}
              onChangeText={setRoomCode}
              autoCapitalize="none"
            />
            
            <TouchableOpacity 
              style={styles.joinButton} 
              onPress={handleJoinRoom}
              disabled={isLoading}>
              <Text style={styles.joinButtonText}>
                {isLoading ? 'Joining...' : 'Join Room'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'room' && (
          <>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1DB954" />
                <Text style={styles.loadingText}>Loading room...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => setActiveTab('create')}>
                  <Text style={styles.actionButtonText}>Go Back</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.roomCodeContainer}>
                  <Text style={styles.roomCodeLabel}>Room Code:</Text>
                  <Text style={styles.roomCode}>{currentRoomId}</Text>
                </View>

                <View style={styles.content}>
                  <View style={styles.songInfo}>
                    <Text style={styles.roomSongTitle}>{currentSong?.title || 'Unknown Title'}</Text>
                    <Text style={styles.roomSongArtist}>{currentSong?.artist || 'Unknown Artist'}</Text>
                  </View>

                  <View style={styles.playerControls}>
                    <View style={styles.seekContainer}>
                      <Text style={styles.timeText}>{formatTime(playbackPosition)}</Text>
                      <Slider
                        style={styles.seekSlider}
                        minimumValue={0}
                        maximumValue={duration || 1}
                        value={playbackPosition}
                        onSlidingComplete={seekTo}
                        minimumTrackTintColor="#1DB954"
                        maximumTrackTintColor="rgba(29, 185, 84, 0.3)"
                        thumbTintColor="#1DB954"
                      />
                      <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>

                    <View style={styles.controlsRow}>
                      <TouchableOpacity onPress={handlePrevious} style={styles.controlButton}>
                        <Ionicons name="play-skip-back" size={24} color="#fff" />
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={styles.playButton} 
                        onPress={togglePlayPause}>
                        <Ionicons 
                          name={isPlaying ? "pause" : "play"} 
                          size={32} 
                          color="#fff" 
                        />
                      </TouchableOpacity>
                      
                      <TouchableOpacity onPress={handleNext} style={styles.controlButton}>
                        <Ionicons name="play-skip-forward" size={24} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.leaveRoomButton} 
                  onPress={handleLeaveRoom}>
                  <Text style={styles.leaveRoomButtonText}>Leave Room</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  shareButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#1DB954',
  },
  tabText: {
    color: '#b3b3b3',
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  formContainer: {
    padding: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 15,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  currentSongContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  songTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  songArtist: {
    color: '#b3b3b3',
    fontSize: 14,
    marginTop: 4,
  },
  noSongText: {
    color: '#b3b3b3',
    fontSize: 16,
    fontStyle: 'italic',
  },
  createButton: {
    backgroundColor: '#1DB954',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  joinButton: {
    backgroundColor: '#1DB954',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Room styles
  loadingContainer: {
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: '#1DB954',
    padding: 12,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  roomCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 10,
    marginHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  roomCodeLabel: {
    color: '#b3b3b3',
    fontSize: 16,
    marginRight: 10,
  },
  roomCode: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginBottom: 20,
  },
  songInfo: {
    alignItems: 'center',
    marginBottom: 40,
  },
  roomSongTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  roomSongArtist: {
    color: '#b3b3b3',
    fontSize: 18,
    textAlign: 'center',
  },
  playerControls: {
    width: '100%',
    alignItems: 'center',
  },
  seekContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 30,
  },
  seekSlider: {
    flex: 1,
    marginHorizontal: 10,
  },
  timeText: {
    color: '#b3b3b3',
    fontSize: 12,
    width: 45,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  controlButton: {
    padding: 15,
    marginHorizontal: 15,
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  leaveRoomButton: {
    backgroundColor: '#ff4444',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 30,
  },
  leaveRoomButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 