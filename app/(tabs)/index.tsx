import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
  ActionSheetIOS,
  Platform,
  Alert,
  Animated,
  Easing,
  TextInput,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  MoreVertical,
  User,
  ListMusic,
  ChevronDown,
  Plus,
  Minus,  Download,
  Heart,
  FolderPlus,
  ChevronRight,
  X,
  MoreHorizontal,
} from 'lucide-react-native';
import { supabase, Song } from '@/lib/supabase';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '@/lib/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { playlistStorage, Playlist } from '@/lib/playlistStorage';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueueStore } from '@/lib/queueStore';
import { usePlayerStore } from '@/lib/playerStore';

const { width } = Dimensions.get('window');

export default function SongList() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreSongs, setHasMoreSongs] = useState(true);
  const [page, setPage] = useState(1);
  const [totalSongs, setTotalSongs] = useState(0);
  const pageSize = 10; // Number of songs to load per page
  const [showQueue, setShowQueue] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isChangingSong, setIsChangingSong] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const titleScrollAnim = useRef(new Animated.Value(0)).current;
  const [titleWidths, setTitleWidths] = useState<{ [key: string]: number }>({});
  const [localQueue, setLocalQueue] = useState<Song[]>([]);
  const [songMenuOpen, setSongMenuOpen] = useState<string | null>(null);
  const { 
    downloadedSongs, 
    favoriteSongs, 
    playlists,
    addToDownloads, 
    removeFromDownloads, 
    toggleFavorite, 
    isSongDownloaded, 
    isSongFavorite,
    loadAndPlaySong: loadAndPlaySongFromContext,
    addSongToPlaylist,
    createPlaylist,
    addToQueue: addToQueueFromContext,
    removeFromQueue,
    loadPlaylists,
    togglePlayPause: togglePlayPauseFromContext,
    isPlaying: isPlayingFromContext,
    currentSong: currentSongFromContext,
    playbackPosition: playbackPositionFromContext,
    duration: durationFromContext,
    seekTo: seekToFromContext,
    handleNext: handleNextFromContext,
    handlePrevious: handlePreviousFromContext,
    isShuffle: isShuffleFromContext,
    isRepeat: isRepeatFromContext,
    toggleShuffle: toggleShuffleFromContext,
    toggleRepeat: toggleRepeatFromContext,
    queue: queueFromContext
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'downloads'>('all');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const tooltipTimeout = useRef<NodeJS.Timeout | null>(null);
  const [menuAnimation] = useState(new Animated.Value(0));

  // Use the player store
  const { 
    currentSong: currentSongFromPlayer,
    isPlaying: isPlayingFromPlayer,
    playbackPosition: playbackPositionFromPlayer,
    duration: durationFromPlayer,
    loadAndPlaySong: loadAndPlaySongFromPlayer,
    togglePlayPause: togglePlayPauseFromPlayer,
    handleNext: handleNextFromPlayer,
    handlePrevious: handlePreviousFromPlayer,
    seekTo: seekToFromPlayer,
    setupAudio: setupAudioFromPlayer,
    loadLastPlayedState: loadLastPlayedStateFromPlayer,
    isLoading: isLoadingAudio,
    error: playerError
  } = usePlayerStore();

  // Use the queue store
  const {
    queue: queueFromStore,
    isShuffle: isShuffleFromStore,
    isRepeat: isRepeatFromStore,
    addToQueue: addToQueueFromStore,
    removeFromQueue: removeFromQueueFromStore,
    toggleShuffle: toggleShuffleFromStore,
    toggleRepeat: toggleRepeatFromStore,
    loadQueue: loadQueueFromStore,
    clearQueue: clearQueueFromStore,
    setCurrentPlaylistId: setCurrentPlaylistIdFromStore
  } = useQueueStore();

  // Get playlist info from queue
  const currentPlaylistId = useQueueStore(state => state.currentPlaylistId);
  const currentPlaylist = playlists.find(p => p.id === currentPlaylistId);

  useEffect(() => {
    setupAudioFromPlayer();
    fetchSongs();
    loadQueueFromStore();
    loadLastPlayedStateFromPlayer();
    loadPlaylists();

    // Start the title scrolling animation
    Animated.loop(
      Animated.sequence([
        // Initial pause (2 seconds)
        Animated.delay(2000),
        // Scroll animation (8 seconds)
        Animated.timing(titleScrollAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // End pause (1 second)
        Animated.delay(1000),
        // Quick reset
        Animated.timing(titleScrollAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => {
      // No need to unload sound here, it's managed by playerStore
    };
  }, []);

  // Update the useEffect to sync with player store
  useEffect(() => {
    if (currentSongFromPlayer) {
      setCurrentSong(currentSongFromPlayer);
      setIsPlaying(isPlayingFromPlayer);
    }
  }, [currentSongFromPlayer, isPlayingFromPlayer]);

  // Add a new useEffect to sync playback position and duration
  useEffect(() => {
    if (playerError) {
      setError(playerError);
    }
  }, [playerError]);

  // Add a useEffect to track queue changes
  useEffect(() => {
    console.log(`Queue updated: ${queueFromStore.length} songs in queue`);
    // If showing queue and queue becomes empty, hide the queue view
    if (showQueue && queueFromStore.length === 0) {
      setShowQueue(false);
    }
  }, [queueFromStore]);

  const fetchSongs = async (pageNum = 1, pageSizeParam = pageSize) => {
    try {
      if (pageNum === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      // Calculate range for pagination
      const startIndex = (pageNum - 1) * pageSizeParam;
      
      // First check if we already know the total and if we're trying to load beyond it
      if (totalSongs > 0 && startIndex >= totalSongs) {
        setHasMoreSongs(false);
        setIsLoadingMore(false);
        return { songs: [], total: totalSongs };
      }
      
      const { data, error, count } = await supabase
        .from('songlist_db')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: true })
        .range(startIndex, startIndex + pageSizeParam - 1);

      if (error) {
        // Check if it's a range error
        if (error.code === 'PGRST103') {
          console.log('No more songs available');
          setHasMoreSongs(false);
          return { songs: [], total: totalSongs || startIndex };
        }
        
        console.error('Error fetching songs:', error);
        setError('Failed to load songs. Please try again later.');
        return { songs: [], total: 0 };
      }

      if (!data || data.length === 0) {
        if (pageNum === 1) {
          setError('No songs found in your library.');
        }
        setHasMoreSongs(false);
        return { songs: [], total: 0 };
      }

      if (pageNum === 1) {
        setSongs(data);
        if (data.length > 0 && !currentSongFromPlayer) {
          setCurrentSong(data[0]);
        }
        setError(null);
      } else {
        setSongs(prevSongs => [...prevSongs, ...data]);
      }

      if (count !== null && count !== undefined) {
        setTotalSongs(count);
        setHasMoreSongs(startIndex + data.length < count);
      } else {
        // If data length is less than page size, we know we've reached the end
        setHasMoreSongs(data.length >= pageSizeParam);
      }
      
      return { songs: data, total: count || data.length };
    } catch (error) {
      console.error('Error in fetchSongs:', error);
      setError('An unexpected error occurred. Please try again later.');
      return { songs: [], total: 0 };
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadAndPlaySong = async (song: Song) => {
    try {
      setIsChangingSong(true);
      setError(null);

      // Use the player store's loadAndPlaySong function
      await loadAndPlaySongFromPlayer(song);
      
      // Update local UI state
      const songIndex = songs.findIndex(s => s.id === song.id);
      if (songIndex !== -1) {
        setCurrentIndex(songIndex);
      }
    } catch (error) {
      console.error('Error loading sound:', error);
      setError('Failed to play the song. Please try again.');
    } finally {
      setIsChangingSong(false);
    }
  };

  const togglePlayPause = () => {
    if (!currentSongFromPlayer) return;
    
    // Set the local state immediately for UI responsiveness  
    setIsPlaying(!isPlayingFromPlayer);
    
    // Fire and forget - no awaiting to prevent UI lag
    togglePlayPauseFromPlayer();
  };

  const playNext = () => {
    handleNextFromPlayer();
  };

  const playPrevious = () => {
    handlePreviousFromPlayer();
  };

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = async (song: Song, replaceQueue: boolean = true) => {
    if (isChangingSong) return;
    
    // Close any open song menu
    setSongMenuOpen(null);
    
    // If it's the current song, just toggle play/pause immediately without waiting
    if (currentSongFromPlayer?.id === song.id) {
      togglePlayPause();
      return;
    }
    
    try {
      setIsChangingSong(true);
      
      // Check if the song is already in the queue
      const isSongInQueue = queueFromStore.some(s => s.id === song.id);
      
      // If the song is already in the queue, just play it without modifying the queue
      if (isSongInQueue) {
        // Set audio loading state to give feedback
        setIsPlaying(true);
        loadAndPlaySongFromPlayer(song);
        return;
      }
      
      // When directly clicking a song, just play that song without adding others
      // This makes the song action button the only way to add to queue
      setIsPlaying(true);
      
      if (replaceQueue) {
        // Clear the queue first and wait for it to complete
        await clearQueueFromStore();
        
        // Add only the selected song
        await addToQueueFromStore([song]);
        setCurrentPlaylistIdFromStore(null);
      }
      
      // Play the selected song
      loadAndPlaySongFromPlayer(song);
    } catch (error) {
      console.error('Error in handlePlayPause:', error);
      setError('Failed to play the song. Please try again.');
    } finally {
      setIsChangingSong(false);
    }
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setShowPlaylistModal(true);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Error', 'Please enter a playlist name');
      return;
    }

    try {
      const newPlaylist = await createPlaylist(newPlaylistName);
      if (selectedSong) {
        await addSongToPlaylist(newPlaylist.id, selectedSong);
      }
      setShowNewPlaylistInput(false);
      setNewPlaylistName('');
      setShowPlaylistModal(false);
    } catch (error) {
      console.error('Error creating playlist:', error);
      Alert.alert('Error', 'Failed to create playlist');
    }
  };

  const handleAddToExistingPlaylist = async (playlist: Playlist) => {
    if (!selectedSong) return;

    try {
      await addSongToPlaylist(playlist.id, selectedSong);
      setShowPlaylistModal(false);
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      Alert.alert('Error', 'Failed to add song to playlist');
    }
  };

  const handleQueueToggle = (song: Song) => {
    if (isInQueue(song.id)) {
      removeFromQueueFromStore(song.id);
    } else {
      addToQueueFromStore([song]);
    }
  };

  const isInQueue = (songId: string) => {
    return queueFromStore.some(song => song.id === songId);
  };

  const toggleSongMenu = (songId: string) => {
    // If clicking the same song's menu button, toggle it
    if (songMenuOpen === songId) {
      Animated.timing(menuAnimation, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setSongMenuOpen(null);
      });
    } else {
      // Otherwise, open this song's menu and close any other
      setSongMenuOpen(songId);
      menuAnimation.setValue(0);
      Animated.timing(menuAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    }
  };

  const handlePressIn = (id: string) => {
    // Clear any existing timeout
    if (tooltipTimeout.current) {
      clearTimeout(tooltipTimeout.current);
    }
    
    // Set a timeout to show the tooltip after 500ms of continuous press
    tooltipTimeout.current = setTimeout(() => {
      setHoveredItem(id);
    }, 500);
  };

  const handlePressOut = () => {
    // Clear the timeout if press is released
    if (tooltipTimeout.current) {
      clearTimeout(tooltipTimeout.current);
      tooltipTimeout.current = null;
    }
    
    // Hide the tooltip
    setHoveredItem(null);
  };

  const renderSong = ({ item }: { item: Song }) => (
    <>
      <TouchableOpacity 
        style={[
          styles.songItem,
          currentSongFromPlayer?.id === item.id && styles.activeSong,
        ]}
        onPress={() => handlePlayPause(item, true)}
        onPressIn={() => handlePressIn(item.id)}
        onPressOut={handlePressOut}>
        <View style={styles.songContent}>
          <Image source={{ uri: item.cover_url }} style={[
            styles.cover,
            currentSongFromPlayer?.id === item.id && styles.activeCover
          ]} />
          <View style={styles.songInfo}>
            <View style={styles.titleContainer}>
              <Animated.Text 
                style={[
                  styles.title,
                  currentSongFromPlayer?.id === item.id && styles.activeTitle,
                  {
                    transform: [{
                      translateX: titleScrollAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -(titleWidths[item.id] || 0)],
                      })
                    }]
                  }
                ]}
                onTextLayout={(event) => {
                  const { lines } = event.nativeEvent;
                  if (lines && lines.length > 0) {
                    const textWidth = lines[0].width;
                    setTitleWidths(prev => ({
                      ...prev,
                      [item.id]: textWidth
                    }));
                  }
                }}>
                {item.title}
              </Animated.Text>
            </View>
            <Text 
              style={[
                styles.artist, 
                currentSongFromPlayer?.id === item.id && styles.activeArtist
              ]} 
              numberOfLines={1}>
              {item.artist}
            </Text>
          </View>
        
          <View style={styles.songActions}>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => toggleFavorite(item)}>
              <Heart 
                size={20} 
                color={isSongFavorite(item.id) ? '#FFA500' : '#b3b3b3'} 
                fill={isSongFavorite(item.id) ? '#FFA500' : 'none'} 
              />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.actionButton,
                songMenuOpen === item.id && styles.actionButtonActive
              ]} 
              onPress={() => toggleSongMenu(item.id)}>
              <MoreHorizontal 
                size={22} 
                color={songMenuOpen === item.id ? '#1DB954' : '#ffffff'} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {songMenuOpen === item.id && (
          <>
            <TouchableOpacity 
              style={styles.menuBackdrop}
              activeOpacity={0}
              onPress={() => toggleSongMenu(item.id)}
            />
            <Animated.View 
              style={[
                styles.expandedMenu,
                {
                  opacity: menuAnimation,
                  transform: [
                    {
                      translateX: menuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                  ],
                },
              ]}>
              
              {/* Download button */}
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => {
                  toggleSongMenu(item.id);
                  isSongDownloaded(item.id) ? removeFromDownloads(item.id) : downloadSong(item);
                }}
                onPressIn={() => handlePressIn('download-' + item.id)}
                onPressOut={handlePressOut}>
                <Download 
                  size={20} 
                  color={isSongDownloaded(item.id) ? '#1DB954' : '#b3b3b3'} 
                />
                {hoveredItem === 'download-' + item.id && (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipText}>
                      {isSongDownloaded(item.id) ? 'Remove Download' : 'Download'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              
              {/* Playlist button */}
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => {
                  toggleSongMenu(item.id);
                  handleAddToPlaylist(item);
                }}
                onPressIn={() => handlePressIn('playlist-' + item.id)}
                onPressOut={handlePressOut}>
                <ListMusic size={20} color="#1DB954" />
                {hoveredItem === 'playlist-' + item.id && (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipText}>Add to Playlist</Text>
                  </View>
                )}
              </TouchableOpacity>
              
              {/* Queue button */}
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => {
                  toggleSongMenu(item.id);
                  handleQueueToggle(item);
                }}
                onPressIn={() => handlePressIn('queue-' + item.id)}
                onPressOut={handlePressOut}>
                {isInQueue(item.id) ? (
                  <Minus size={20} color="#FF4444" />
                ) : (
                  <Plus size={20} color="#1DB954" />
                )}
                {hoveredItem === 'queue-' + item.id && (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipText}>
                      {isInQueue(item.id) ? 'Remove from Queue' : 'Add to Queue'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          </>
        )}

        {/* {currentSongFromPlayer?.id === item.id && (
          <View style={styles.playingIndicator}>
            <View style={styles.playingDot} />
            <View style={styles.playingDot} />
            <View style={styles.playingDot} />
          </View>
        )} */}
      </TouchableOpacity>
      <View style={styles.divider} />
    </>
  );

  const renderPlaylistItem = ({ item }: { item: Playlist }) => {
    // Check if the song is already in this playlist
    const isSongInPlaylist = selectedSong && item.songs.some(s => s.id === selectedSong.id);
    
    // If the song is already in the playlist, don't render the item
    if (isSongInPlaylist) {
      return null;
    }
    
    return (
      <TouchableOpacity
        style={styles.playlistItem}
        onPress={() => {
          if (selectedSong) {
            handleAddToExistingPlaylist(item);
          }
        }}>
        <FolderPlus size={24} color="#1DB954" />
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName}>{item.name}</Text>
          <Text style={styles.playlistCount}>{item.songs.length} songs</Text>
        </View>
        <ChevronRight size={20} color="#b3b3b3" />
      </TouchableOpacity>
    );
  };

  const loadStoredSongs = async () => {
    // This would normally load from AsyncStorage
    // For now, we'll just initialize with empty arrays
  };

  // Update the seekTo function to use player store
  const seekTo = async (position: number) => {
    await seekToFromPlayer(position);
  };

  const downloadSong = async (song: Song) => {
    try {
      // Check if already downloaded
      if (isSongDownloaded(song.id)) {
        removeFromDownloads(song.id);
        return;
      }

      // Add to downloads
      addToDownloads(song);
    } catch (error) {
      console.error('Error downloading song:', error);
    }
  };

  const renderQueueItem = ({ item, index }: { item: Song; index: number }) => (
    <TouchableOpacity
      style={[
        styles.queueItem,
        currentSongFromPlayer?.id === item.id && styles.activeQueueItem,
      ]}
      onPress={() => handlePlayPause(item)}>
      <View style={styles.queueItemContent}>
        <View style={styles.queueItemLeft}>
          <Text style={styles.queueIndex}>{index + 1}</Text>
          <Image source={{ uri: item.cover_url }} style={styles.queueCover} />
          <View style={styles.queueInfo}>
            <Text style={styles.queueTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.queueArtist} numberOfLines={1}>{item.artist}</Text>
          </View>
        </View>
        <View style={styles.queueItemActions}>
          {currentSongFromPlayer?.id === item.id && (
            <View style={styles.playingIndicator}>
              <View style={styles.playingDot} />
              <View style={styles.playingDot} />
              <View style={styles.playingDot} />
            </View>
          )}
          <TouchableOpacity 
            style={styles.queueRemoveButton}
            onPress={() => removeFromQueueFromStore(item.id)}>
            <Minus size={18} color="#FF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Add a method to add song to queue without replacing current queue
  const addToQueue = (song: Song) => {
    // Check if the song is already in the queue
    if (!isInQueue(song.id)) {
      addToQueueFromStore([song]);
      Alert.alert("Added to Queue", `"${song.title}" has been added to the queue.`);
    } else {
      Alert.alert("Already in Queue", `"${song.title}" is already in the queue.`);
    }
  };

  // Add a method to play next after current song
  const playNextAfterCurrent = (song: Song) => {
    // If there's a current song playing
    if (currentSongFromPlayer) {
      // Find the current song's index in the queue
      const currentIndex = queueFromStore.findIndex(s => s.id === currentSongFromPlayer.id);
      
      // If found, insert the song right after the current song
      if (currentIndex !== -1) {
        // Create a new queue with the song inserted after the current song
        const newQueue = [...queueFromStore];
        newQueue.splice(currentIndex + 1, 0, song);
        
        // Update the queue
        clearQueueFromStore();
        addToQueueFromStore(newQueue);
        
        Alert.alert("Play Next", `"${song.title}" will play after the current song.`);
        return;
      }
    }
    
    // If no current song or current song not found in queue
    addToQueueFromStore([song]);
    Alert.alert("Added to Queue", `"${song.title}" has been added to the queue.`);
  };

  // Function to load more songs when user scrolls to the bottom
  const loadMoreSongs = async () => {
    if (isLoadingMore || !hasMoreSongs) return;
    
    try {
      setIsLoadingMore(true);
      
      // Increment page and fetch more songs
      const nextPage = page + 1;
      setPage(nextPage);
      
      // Fetch the next page of songs
      await fetchSongs(nextPage, pageSize);
    } catch (error) {
      console.error('Error loading more songs:', error);
      setHasMoreSongs(false);
    }
  };

  // Add function to handle scroll and close menu when scrolling
  const handleScroll = () => {
    if (songMenuOpen) {
      setSongMenuOpen(null);
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#121212', '#1a1a1a', '#121212']}
      style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
        <Image
            source={{ uri: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user' }} 
            style={styles.avatar}
        />
          <Text style={styles.headerTitle}>Your Library</Text>
        </View>
      </View>

      <FlatList
        data={songs}
        renderItem={renderSong}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onEndReached={loadMoreSongs}
        onEndReachedThreshold={0.5}
        onScroll={handleScroll}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.listHeader} />}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color="#1DB954" />
              <Text style={styles.loadingMoreText}>Loading more songs...</Text>
            </View>
          ) : !hasMoreSongs && songs.length > 0 ? (
            <View style={styles.endOfListContainer}>
              <Text style={styles.endOfListText}>No more songs to load</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={styles.loadingText}>Loading songs...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No songs found</Text>
            </View>
          )
        }
      />

      {currentSongFromPlayer && (
        <View style={styles.playerContainer}>
          <TouchableOpacity 
            style={styles.queueToggle}
            onPress={() => setShowQueue(!showQueue)}>
            <ListMusic size={20} color="#1DB954" />
            <Text style={styles.queueToggleText}>
              {currentPlaylist ? `Queue: ${currentPlaylist.name}` : 'Queue'}
            </Text>
            <ChevronDown 
              size={20} 
              color="#1DB954" 
              style={[
                styles.queueToggleIcon,
                showQueue && styles.queueToggleIconUp
              ]} 
            />
          </TouchableOpacity>

          {showQueue && (
            <View style={styles.queueContainer}>
              <FlatList
                data={queueFromStore}
                renderItem={renderQueueItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.queueList}
              />
            </View>
          )}

          <View style={styles.playerControls}>
            <View style={styles.currentSongInfoContainer}>
              <Image source={{ uri: currentSongFromPlayer.cover_url }} style={styles.currentCover} />
              <View style={styles.currentSongInfo}>
                <Text style={styles.currentTitle}>{currentSongFromPlayer.title}</Text>
                {isLoadingAudio && (
                  <Text style={styles.loadingText}>Loading audio...</Text>
                )}
              </View>
            </View>

            <View style={styles.seekContainer}>
              <Text style={styles.timeText}>{formatTime(playbackPositionFromPlayer)}</Text>
              <Slider
                style={styles.seekSlider}
                minimumValue={0}
                maximumValue={durationFromPlayer}
                value={playbackPositionFromPlayer}
                onSlidingComplete={seekTo}
                minimumTrackTintColor="#1DB954"
                maximumTrackTintColor="rgba(29, 185, 84, 0.3)"
                thumbTintColor="#1DB954"
              />
              <Text style={styles.timeText}>{formatTime(durationFromPlayer)}</Text>
            </View>

            <View style={styles.controls}>
              <TouchableOpacity onPress={toggleShuffleFromStore}>
                <Shuffle size={24} color={isShuffleFromStore ? '#1DB954' : '#b3b3b3'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePreviousFromPlayer}>
                <SkipBack size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playButton}
                onPress={togglePlayPause}>
                {isPlayingFromPlayer ? (
                  <Pause size={32} color="#fff" />
                ) : (
                  <Play size={32} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNextFromPlayer}>
                <SkipForward size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleRepeatFromStore}>
                <Repeat size={24} color={isRepeatFromStore ? '#1DB954' : '#b3b3b3'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal
        visible={showPlaylistModal}
        animationType="slide"
        transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Playlist</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowPlaylistModal(false)}>
                <X size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.addPlaylistButton}
              onPress={() => setShowNewPlaylistInput(true)}>
              <Plus size={24} color="#1DB954" />
              <Text style={styles.addPlaylistText}>Create New Playlist</Text>
            </TouchableOpacity>

            {showNewPlaylistInput && (
              <View style={styles.newPlaylistInput}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter playlist name"
                  placeholderTextColor="#b3b3b3"
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={handleCreatePlaylist}>
                  <Text style={styles.createButtonText}>Create</Text>
                </TouchableOpacity>
              </View>
            )}

            <FlatList
              data={playlists}
              renderItem={renderPlaylistItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No playlists yet</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#fff',
  },
  list: {
    paddingBottom: 20,
    paddingHorizontal: 0,
  },
  songItem: {
    overflow: 'hidden',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  activeSong: {
    borderLeftWidth: 4,
    borderLeftColor: '#1DB954',
    paddingLeft: 12, // Compensate for the border to keep content alignment
  },
  songContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  songInfo: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },
  titleContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  artist: {
    color: '#b3b3b3',
    fontSize: 14,
  },
  songActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  queueButtonActive: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  playingIndicator: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  playingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1DB954',
    marginHorizontal: 2,
    opacity: 0.8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#b3b3b3',
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
  },
  playerContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  queueToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  queueToggleText: {
    color: '#1DB954',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  queueToggleIcon: {
    marginLeft: 'auto',
    transform: [{ rotate: '0deg' }],
  },
  queueToggleIconUp: {
    transform: [{ rotate: '180deg' }],
  },
  queueContainer: {
    maxHeight: 300,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  queueList: {
    padding: 10,
  },
  queueItem: {
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  activeQueueItem: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    borderColor: '#1DB954',
    borderWidth: 1,
  },
  queueItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  queueItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  queueIndex: {
    color: '#b3b3b3',
    width: 24,
    fontSize: 14,
    fontWeight: '600',
  },
  queueCover: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  queueInfo: {
    flex: 1,
    marginRight: 8,
  },
  queueTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  queueArtist: {
    color: '#b3b3b3',
    fontSize: 12,
  },
  queueItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueRemoveButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  playerControls: {
    padding: 20,
  },
  currentSongInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  currentCover: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  currentSongInfo: {
    flex: 1,
  },
  currentTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  currentArtist: {
    color: '#b3b3b3',
    fontSize: 14,
    marginTop: 4,
  },
  seekContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 15,
  },
  playlistName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  playlistCount: {
    color: '#b3b3b3',
    fontSize: 14,
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  modalList: {
    padding: 20,
  },
  loadingMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMoreText: {
    color: '#b3b3b3',
    marginTop: 10,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 18,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  addPlaylistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1DB954',
  },
  addPlaylistText: {
    color: '#1DB954',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  newPlaylistInput: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  createButton: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 4,
    marginLeft: 10,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  endOfListContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endOfListText: {
    color: '#b3b3b3',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginVertical: 2,
  },
  expandedMenu: {
    flexDirection: 'row',
    position: 'absolute',
    top: 13,
    right: 64, 
    backgroundColor: 'rgba(25, 25, 25, 0.95)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    zIndex: 10,
  },
  menuItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    width: 44,
    height: 44,
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
    elevation: 1,
  },
  tooltip: {
    position: 'absolute',
    top: -35,
    left: -32, // Center the tooltip above the icon
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 4,
    padding: 6,
    minWidth: 100,
    zIndex: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  actionButtonActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
  },
  listHeader: {
    height: 10,
  },
  activeCover: {
    borderWidth: 2,
    borderColor: '#1DB954',
  },
  activeTitle: {
    color: '#1DB954',
    fontWeight: '700',
  },
  activeArtist: {
    color: 'rgba(29, 185, 84, 0.7)',
  },
});