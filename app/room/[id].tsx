import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Share } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ref, onValue, off } from 'firebase/database';
import { database } from '../../lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { usePlayerStore, setCurrentRoomId } from '@/lib/playerStore';

export default function RoomScreen() {
  const { id } = useLocalSearchParams();
  const [roomData, setRoomData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use the player store
  const { 
    currentSong,
    isPlaying,
    playbackPosition,
    duration,
    togglePlayPause,
    seekTo,
    joinRoom,
    leaveRoom
  } = usePlayerStore();

  useEffect(() => {
    if (!id) {
      setError('Room ID is missing');
      setIsLoading(false);
      return;
    }

    // Set up Firebase listener to get room data
    const roomRef = ref(database, `rooms/${id as string}`);
    
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
    joinRoom(id as string);
    
    // Clean up when leaving the room
    return () => {
      off(roomRef, 'value', roomListener);
      leaveRoom();
    };
  }, [id]);

  // Add another useEffect to update the loading state when song changes
  useEffect(() => {
    if (currentSong && isLoading) {
      setIsLoading(false);
    }
  }, [currentSong]);

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const shareRoomCode = async () => {
    try {
      await Share.share({
        message: `Join my music room! Room code: ${id}`,
        title: 'Join Music Room',
      });
    } catch (error) {
      console.error('Error sharing room code:', error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1DB954" />
        <Text style={styles.loadingText}>Loading room...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#121212', '#1a1a1a', '#121212']}
      style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{roomData?.name || 'Music Room'}</Text>
        <TouchableOpacity 
          style={styles.shareButton}
          onPress={shareRoomCode}>
          <Ionicons name="share-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.roomCodeContainer}>
        <Text style={styles.roomCodeLabel}>Room Code:</Text>
        <Text style={styles.roomCode}>{id}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.songInfo}>
          <Text style={styles.songTitle}>{currentSong?.title || 'Unknown Title'}</Text>
          <Text style={styles.songArtist}>{currentSong?.artist || 'Unknown Artist'}</Text>
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

          <TouchableOpacity 
            style={styles.playButton} 
            onPress={togglePlayPause}>
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={32} 
              color="#fff" 
            />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#1DB954',
    padding: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 15,
    flex: 1,
  },
  shareButton: {
    padding: 8,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  songInfo: {
    alignItems: 'center',
    marginBottom: 40,
  },
  songTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  songArtist: {
    color: '#b3b3b3',
    fontSize: 18,
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
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 