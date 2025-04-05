import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/lib/AppContext';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Song } from '@/lib/supabase';
import { usePlayerStore } from '@/lib/playerStore';

const { width, height } = Dimensions.get('window');

// Pre-defined vibrant color palette for music genres
const colorPalettes: Record<string, readonly [string, string, string, string]> = {
  pop: ['#FF1493', '#8A2BE2', '#00BFFF', '#191414'],
  rock: ['#B22222', '#FF8C00', '#8B0000', '#191414'],
  jazz: ['#4B0082', '#9370DB', '#483D8B', '#191414'],
  electronic: ['#00FFFF', '#7FFFD4', '#40E0D0', '#191414'],
  hiphop: ['#FFD700', '#FF8C00', '#FF4500', '#191414'],
  classical: ['#9ACD32', '#6B8E23', '#556B2F', '#191414'],
  ambient: ['#87CEEB', '#B0E0E6', '#ADD8E6', '#191414'],
  default: ['#1DB954', '#191414', '#1DB954', '#191414'],
};

// Generate vibrant colors based on song title/artist
const generateColorFromText = (text: string): string => {
  if (!text) return '#1DB954';
  
  // Use string hashing to generate a predictable but "random" color
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to hex color
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    // Make colors vibrant by ensuring they're not too dark
    const adjustedValue = Math.max(value, 100);
    color += ('00' + adjustedValue.toString(16)).substr(-2);
  }
  
  return color;
};

// Create a complementary color scheme
const getColorScheme = (baseColor: string): readonly [string, string, string, string] => {
  // Simple way to create complementary colors
  const complement = '#' + (0xFFFFFF ^ parseInt(baseColor.substring(1), 16)).toString(16).padStart(6, '0');
  
  // Create a darker variant of base color
  const darkerColor = baseColor.replace(/[0-9a-f]{2}/g, (hex: string) => {
    const num = parseInt(hex, 16);
    return Math.max(0, num - 60).toString(16).padStart(2, '0');
  });
  
  return [baseColor, '#191414', complement, darkerColor] as const;
};

// Dynamic color combinations for mesh gradients
const gradientColors = [
  ['#FF6B6B', '#4ECDC4', '#45B7D1'] as const, // Coral to Turquoise
  ['#A8E6CF', '#FF8B94', '#FFAAA5'] as const, // Mint to Coral
  ['#FFD93D', '#FF6B6B', '#4ECDC4'] as const, // Yellow to Turquoise
  ['#6C5CE7', '#A8E6CF', '#FF8B94'] as const, // Purple to Coral
  ['#FF8B94', '#FFD93D', '#6C5CE7'] as const, // Coral to Purple
];

export default function Player() {
  // Get playback state and controls from context
  const { 
    downloadedSongs, 
    favoriteSongs, 
    playlists,
    isShuffle,
    isRepeat,
    toggleShuffle,
    toggleRepeat
  } = useAppContext();
  
  // Use playerStore for audio controls
  const {
    currentSong,
    isPlaying,
    playbackPosition,
    duration,
    togglePlayPause,
    handleNext,
    handlePrevious,
    seekTo
  } = usePlayerStore();
  
  const [primaryColor, setPrimaryColor] = useState('#1DB954');
  const [currentGradientIndex, setCurrentGradientIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const previousSongId = useRef<string | null>(null);
  
  // Animation values for the mesh gradients
  const meshAnim = useRef(new Animated.Value(0)).current;

  // Calculate gradient progress based on song position
  const gradientProgress = playbackPosition / duration;

  // New animations for gradient balls
  const ball1Anim = useRef(new Animated.Value(0)).current;
  const ball2Anim = useRef(new Animated.Value(0)).current;
  const ball3Anim = useRef(new Animated.Value(0)).current;

  const ball1Colors: readonly [string, string] = ['#FF1493', '#8A2BE2'];
  const ball2Colors: readonly [string, string] = ['#00BFFF', '#191414'];
  const ball3Colors: readonly [string, string] = ['#FFD700', '#FF8C00'];

  // Update UI based on the currentSong and isPlaying state
  useEffect(() => {
    if (currentSong && currentSong.id !== previousSongId.current) {
      // Fade out current gradient
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        // Change gradient and fade in
        setCurrentGradientIndex(prev => (prev + 1) % gradientColors.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start();
      });
      previousSongId.current = currentSong.id;
    }
  }, [currentSong]);

  // Calculate dynamic colors based on progress
  const getDynamicColors = (baseColors: readonly [string, string, string], progress: number) => {
    const startColor = baseColors[0];
    const endColor = baseColors[2];
    const midColor = baseColors[1];
    
    // Smooth color interpolation based on progress
    if (progress < 0.5) {
      return [startColor, midColor, endColor] as const;
    } else {
      return [endColor, midColor, startColor] as const;
    }
  };

  // Get dynamic colors for the mesh gradient
  const meshColors = getDynamicColors(gradientColors[currentGradientIndex], gradientProgress);

  // Animation for gradient balls
  useEffect(() => {
    const createBallAnimation = (animValue: Animated.Value, duration: number) => {
      return Animated.loop(
        Animated.timing(animValue, {
          toValue: 1,
          duration: duration,
          useNativeDriver: true,
          easing: Easing.linear,
        })
      );
    };

    if (isPlaying) {
      createBallAnimation(ball1Anim, 15000).start();
      createBallAnimation(ball2Anim, 20000).start();
      createBallAnimation(ball3Anim, 25000).start();
    } else {
      ball1Anim.stopAnimation();
      ball2Anim.stopAnimation();
      ball3Anim.stopAnimation();
    }

    return () => {
      ball1Anim.stopAnimation();
      ball2Anim.stopAnimation();
      ball3Anim.stopAnimation();
    };
  }, [isPlaying]);

  // Animation for song title scrolling
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [titleWidth, setTitleWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(300);
  
  useEffect(() => {
    if (titleWidth > containerWidth) {
      // Reset animation
      scrollAnim.setValue(0);
      
      // Start scrolling animation with sequence
      Animated.sequence([
        // Wait at start
        Animated.delay(1000),
        // Scroll to end
        Animated.timing(scrollAnim, {
          toValue: -(titleWidth - containerWidth + 20),
          duration: Math.min(15000, titleWidth * 20),
          useNativeDriver: true,
        }),
        // Wait at end
        Animated.delay(1000),
        // Return to start (quickly)
        Animated.timing(scrollAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        })
      ]).start(() => {
        // Loop the animation
        if (currentSong) {
          scrollAnim.setValue(0);
          Animated.loop(
            Animated.sequence([
              Animated.delay(1000),
              Animated.timing(scrollAnim, {
                toValue: -(titleWidth - containerWidth + 20),
                duration: Math.min(15000, titleWidth * 20),
                useNativeDriver: true,
              }),
              Animated.delay(1000),
              Animated.timing(scrollAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
              })
            ])
          ).start();
        }
      });
    }
  }, [titleWidth, containerWidth, currentSong?.title]);

  // Pulse animation for when music is playing
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      // Stop pulsing when paused
      pulseAnim.setValue(1);
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 0,
        useNativeDriver: true,
      }).stop();
    }
  }, [isPlaying]);

  // Rotate animation interpolation
  const spin = ball1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  // Handle image loading errors
  const [imageError, setImageError] = useState(false);
  
  // Reset image error state when song changes
  useEffect(() => {
    setImageError(false);
  }, [currentSong]);

  // Function to handle image loading errors
  const handleImageError = () => {
    console.log("Error loading image, using fallback");
    setImageError(true);
  };

  if (!currentSong) {
    return (
      <View style={styles.container}>
        <Text style={styles.noSong}>No song selected</Text>
      </View>
    );
  }

  const formatTime = (millis: number) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <View style={styles.container}>
      <Animated.View 
        style={[
          styles.gradientContainer,
          {
            opacity: fadeAnim,
          }
        ]}>
        {/* Animated mesh gradient */}
        <Animated.View
          style={[
            styles.meshGradient,
            {
              transform: [
                {
                  scale: meshAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.2],
                  }),
                },
                {
                  rotate: meshAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}>
          <LinearGradient
            colors={meshColors}
            style={styles.mesh}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Base gradient background */}
        <LinearGradient
          colors={['#1a1a1a', '#2a2a2a', '#1a1a1a']}
          style={styles.baseGradient}
        />
      </Animated.View>

      {/* Animated gradient balls */}
      <Animated.View
        style={[
          styles.gradientBall,
          {
            transform: [
              {
                translateX: ball1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width * 0.1, width * 0.9],
                }),
              },
              {
                translateY: ball1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height * 0.2, height * 0.8],
                }),
              },
              {
                scale: ball1Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.8, 1.2, 0.8],
                }),
              },
            ],
            opacity: isPlaying ? 0.3 : 0.1,
          },
        ]}>
        <LinearGradient
          colors={ball1Colors}
          style={styles.ballGradient}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.gradientBall,
          {
            transform: [
              {
                translateX: ball2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width * 0.9, width * 0.1],
                }),
              },
              {
                translateY: ball2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height * 0.8, height * 0.2],
                }),
              },
              {
                scale: ball2Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.8, 1.2, 0.8],
                }),
              },
            ],
            opacity: isPlaying ? 0.3 : 0.1,
          },
        ]}>
        <LinearGradient
          colors={ball2Colors}
          style={styles.ballGradient}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.gradientBall,
          {
            transform: [
              {
                translateX: ball3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width * 0.1, width * 0.9],
                }),
              },
              {
                translateY: ball3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height * 0.5, height * 0.5],
                }),
              },
              {
                scale: ball3Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.8, 1.2, 0.8],
                }),
              },
            ],
            opacity: isPlaying ? 0.3 : 0.1,
          },
        ]}>
        <LinearGradient
          colors={ball3Colors}
          style={styles.ballGradient}
        />
      </Animated.View>

      <View style={styles.content}>
        <Animated.View style={[styles.artworkContainer, {
          transform: isPlaying ? [
            { rotate: spin },
            { scale: pulseAnim }
          ] : [{ rotate: '0deg' }]
        }]}>
          <Image 
            source={{ 
              uri: imageError 
                ? `https://avatar.iran.liara.run/public/${Math.abs(
                    currentSong.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % 100
                  ) + 1}` 
                : currentSong.cover_url 
            }} 
            style={styles.artwork}
            onError={handleImageError}
          />
        </Animated.View>
        
        <View 
          style={styles.songInfo}
          onLayout={(event) => {
            setContainerWidth(event.nativeEvent.layout.width);
          }}>
          
          <View style={styles.titleContainer}>
            <Animated.Text 
              style={[styles.title, {
                transform: [{ translateX: scrollAnim }]
              }]}
              onLayout={(event) => {
                setTitleWidth(event.nativeEvent.layout.width);
              }}>
              {currentSong.title}
            </Animated.Text>
          </View>
          <Text style={styles.artist}>{currentSong.artist}</Text>
        </View>

        <View style={styles.controls}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration}
            value={playbackPosition}
            onSlidingComplete={seekTo}
            minimumTrackTintColor={primaryColor}
            maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
            thumbTintColor={primaryColor}
          />
          
          <View style={styles.timeInfo}>
            <Text style={styles.time}>{formatTime(playbackPosition)}</Text>
            <Text style={styles.time}>{formatTime(duration)}</Text>
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity 
              style={[styles.button, isShuffle && styles.activeButton]} 
              onPress={toggleShuffle}>
              <Shuffle size={24} color="#fff" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.button} 
              onPress={handlePrevious}>
              <SkipBack size={32} color="#fff" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.playButton, { backgroundColor: primaryColor }]} 
              onPress={togglePlayPause}>
              {isPlaying ? (
                <Pause size={40} color="#000" />
              ) : (
                <Play size={40} color="#000" />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.button} 
              onPress={handleNext}>
              <SkipForward size={32} color="#fff" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, isRepeat && styles.activeButton]} 
              onPress={toggleRepeat}>
              <Repeat size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  gradientContainer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  meshGradient: {
    position: 'absolute',
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: width * 0.2,
    overflow: 'hidden',
  },
  mesh: {
    flex: 1,
  },
  baseGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  gradientBall: {
    position: 'absolute',
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: width * 0.2,
    overflow: 'hidden',
  },
  ballGradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    zIndex: 1,
  },
  noSong: {
    color: '#fff',
    fontSize: 18,
  },
  artworkContainer: {
    width: 300,
    height: 300,
    borderRadius: 150,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.44,
    shadowRadius: 10.32,
    elevation: 16,
    overflow: 'hidden',
  },
  artwork: {
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  songInfo: {
    alignItems: 'center',
    marginBottom: 30,
    width: width * 0.8,
  },
  visualizer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: 30,
    marginBottom: 10,
  },
  visualizerBar: {
    width: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
  titleContainer: {
    width: width * 0.8,
    height: 35,
    overflow: 'hidden',
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  artist: {
    color: '#b3b3b3',
    fontSize: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  controls: {
    width: '100%',
    paddingHorizontal: 40,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -10,
    marginBottom: 20,
  },
  time: {
    color: '#b3b3b3',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 5,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    marginHorizontal: 20,
  },
  playButton: {
    width: 64,
    height: 64,
    backgroundColor: '#1DB954',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  activeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 8,
  },
});
