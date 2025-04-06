import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { 
  Play, 
  Pause, 
  Download, 
  Heart, 
  Plus, 
  FolderPlus,
  ChevronRight,
  Trash2,
  X,
  ListMusic,
  Minus,
  Shuffle,
  SkipBack,
  SkipForward,
  Repeat,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, Song } from '@/lib/supabase';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAppContext } from '@/lib/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { playlistStorage, Playlist } from '@/lib/playlistStorage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getLocalSongPath } from '@/lib/offlineStorage';
import { useQueueStore } from '@/lib/queueStore';
import { usePlayerStore } from '@/lib/playerStore';

export default function LibraryScreen() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreSongs, setHasMoreSongs] = useState(true);
  const [page, setPage] = useState(1);
  const [totalSongs, setTotalSongs] = useState(0);
  const pageSize = 20; // Number of songs to load per page
  const [activeTab, setActiveTab] = useState<'playlists' | 'downloads' | 'favorites'>('playlists');
  const [displayedPlaylists, setDisplayedPlaylists] = useState<Playlist[]>([]);
  const [displayedDownloads, setDisplayedDownloads] = useState<Song[]>([]);
  const [displayedFavorites, setDisplayedFavorites] = useState<Song[]>([]);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [displayedPlaylistSongs, setDisplayedPlaylistSongs] = useState<Song[]>([]);
  const [isLoadingMorePlaylistSongs, setIsLoadingMorePlaylistSongs] = useState(false);
  const [playlistPage, setPlaylistPage] = useState(1);
  const [hasMorePlaylistSongs, setHasMorePlaylistSongs] = useState(true);
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const titleScrollAnim = useRef(new Animated.Value(0)).current;
  const [titleWidths, setTitleWidths] = useState<{ [key: string]: number }>({});
  const [isChangingSong, setIsChangingSong] = useState(false);
  const [isDownloading, setIsDownloading] = useState<{ [key: string]: boolean }>({});
  
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
  
  const { 
    downloadedSongs, 
    favoriteSongs, 
    playlists: contextPlaylists,
    addToDownloads, 
    removeFromDownloads, 
    toggleFavorite, 
    isSongDownloaded, 
    isSongFavorite,
    loadPlaylists,
    addSongToPlaylist,
    removeSongFromPlaylist,
    createPlaylist,
    deletePlaylist
  } = useAppContext();
  const { selectedPlaylist: initialSelectedPlaylist } = useLocalSearchParams<{ selectedPlaylist: string }>();
  const router = useRouter();

  useEffect(() => {
    setupAudioFromPlayer();
    fetchSongs();
    loadPlaylists();
    loadQueueFromStore();
    loadLastPlayedStateFromPlayer();

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
  }, []);

  // Handle navigation parameter for selected playlist
  useEffect(() => {
    if (initialSelectedPlaylist) {
      const playlist = contextPlaylists.find(p => p.id === initialSelectedPlaylist);
      if (playlist) {
        setSelectedPlaylist(playlist);
        setDisplayedPlaylistSongs(playlist.songs.slice(0, pageSize));
        setShowPlaylistModal(true);
      }
    }
  }, [initialSelectedPlaylist, contextPlaylists]);

  // Update displayed items when active tab changes
  useEffect(() => {
    if (activeTab === 'playlists') {
      setDisplayedPlaylists(contextPlaylists.slice(0, pageSize));
    } else if (activeTab === 'downloads') {
      setDisplayedDownloads(downloadedSongs.slice(0, pageSize));
    } else if (activeTab === 'favorites') {
      const favoriteSongsList = songs.filter(song => favoriteSongs.includes(song.id));
      setDisplayedFavorites(favoriteSongsList.slice(0, pageSize));
    }
    setPage(1);
    setHasMoreSongs(true);
  }, [activeTab, contextPlaylists, downloadedSongs, favoriteSongs, songs]);

  // Update the useEffect to sync with player store
  useEffect(() => {
    if (currentSongFromPlayer) {
      const songIndex = songs.findIndex(s => s.id === currentSongFromPlayer.id);
      if (songIndex !== -1) {
        setCurrentIndex(songIndex);
      }
    }
  }, [currentSongFromPlayer, songs]);

  // Add a new useEffect to sync playback position and duration
  useEffect(() => {
    if (playerError) {
      setError(playerError);
    }
  }, [playerError]);

  // Function to load more items when user scrolls to the bottom
  const loadMoreItems = () => {
    if (isLoadingMore || !hasMoreSongs) return;
    
    setIsLoadingMore(true);
    
    // Calculate the next page of items
    const nextPage = page + 1;
    const startIndex = (nextPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    // Get the next batch of items based on active tab
    let nextBatch: any[] = [];
    let allItems: any[] = [];
    
    switch (activeTab) {
      case 'playlists':
        allItems = contextPlaylists;
        nextBatch = contextPlaylists.slice(startIndex, endIndex);
        setDisplayedPlaylists(prev => [...prev, ...nextBatch]);
        break;
      case 'downloads':
        allItems = downloadedSongs;
        nextBatch = downloadedSongs.slice(startIndex, endIndex);
        setDisplayedDownloads(prev => [...prev, ...nextBatch]);
        break;
      case 'favorites':
        allItems = songs.filter(song => favoriteSongs.includes(song.id));
        nextBatch = allItems.slice(startIndex, endIndex);
        setDisplayedFavorites(prev => [...prev, ...nextBatch]);
        break;
    }
    
    // Update page and hasMoreItems
    setPage(nextPage);
    setHasMoreSongs(endIndex < allItems.length);
    
    setIsLoadingMore(false);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Error', 'Please enter a playlist name');
      return;
    }
    
    try {
      const newPlaylist = await createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setShowNewPlaylistInput(false);
    } catch (error) {
      console.error('Error creating playlist:', error);
      Alert.alert('Error', 'Failed to create playlist');
    }
  };

  const handlePlayPause = async (song: Song, replaceQueue: boolean = true) => {
    if (isChangingSong) return;
    
    try {
      setIsChangingSong(true);
      if (currentSongFromPlayer?.id === song.id) {
        togglePlayPauseFromPlayer();
        return;
      } 
        
      // Check if the song is already in the queue
      const isSongInQueue = queueFromStore.some(s => s.id === song.id);
      
      // If the song is already in the queue, just play it without modifying the queue
      if (isSongInQueue) {
        await loadAndPlaySongFromPlayer(song);
        return;
      }
      
      // Update queue based on current context
      let newQueue: Song[] = [];
      
      if (showPlaylistModal && selectedPlaylist) {
        // If in playlist view, use the playlist songs
        const songIndex = selectedPlaylist.songs.findIndex(s => s.id === song.id);
        // Add all songs from the playlist to the queue
        newQueue = [...selectedPlaylist.songs.slice(songIndex), ...selectedPlaylist.songs.slice(0, songIndex)];
        
        // Explicitly set current playlist ID to ensure consistent state across tabs
        setCurrentPlaylistIdFromStore(selectedPlaylist.id);
        
        // Log for debugging
        console.log(`Adding ${newQueue.length} songs from playlist "${selectedPlaylist.name}" to queue`);
      } else if (activeTab === 'favorites') {
        // If in favorites tab, use favorite songs
        const favoriteSongsList = songs.filter(s => favoriteSongs.includes(s.id));
        const songIndex = favoriteSongsList.findIndex(s => s.id === song.id);
        newQueue = [...favoriteSongsList.slice(songIndex), ...favoriteSongsList.slice(0, songIndex)];
        setCurrentPlaylistIdFromStore(null);
      } else if (activeTab === 'downloads') {
        // If in downloads tab, use downloaded songs
        const songIndex = downloadedSongs.findIndex(s => s.id === song.id);
        newQueue = [...downloadedSongs.slice(songIndex), ...downloadedSongs.slice(0, songIndex)];
        setCurrentPlaylistIdFromStore(null);
      } else {
        // Default to all songs
        const songIndex = songs.findIndex(s => s.id === song.id);
        newQueue = [...songs.slice(songIndex), ...songs.slice(0, songIndex)];
        setCurrentPlaylistIdFromStore(null);
      }
      
      if (replaceQueue) {
        // Clear the current queue first and wait for it to complete
        await clearQueueFromStore();
      }
      
      if (newQueue.length > 0) {
        // Then add the new songs to the empty queue
        await addToQueueFromStore(newQueue);
      }
      
      // Play the selected song
      await loadAndPlaySongFromPlayer(song);
    } catch (error) {
      console.error('Error in handlePlayPause:', error);
      setError('Failed to play the song. Please try again.');
    } finally {
      setIsChangingSong(false);
    }
  };

  const togglePlayPause = async () => {
    if (!currentSongFromPlayer) return;
    await togglePlayPauseFromPlayer();
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

  const isInQueue = (songId: string) => {
    return queueFromStore.some(song => song.id === songId);
  };

  const handleQueueToggle = (song: Song) => {
    if (isInQueue(song.id)) {
      removeFromQueueFromStore(song.id);
    } else {
      addToQueueFromStore([song]);
    }
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

  const handleToggleFavorite = (song: Song) => {
    toggleFavorite(song);
  };

  const handleAddSongToPlaylist = async (song: Song) => {
    if (!selectedPlaylist) return;
    
    try {
      // Check if the song is already in the playlist
      if (selectedPlaylist.songs.some(s => s.id === song.id)) {
        Alert.alert('Info', 'Song is already in this playlist');
        return;
      }
      
      // Add the song to the playlist
      await addSongToPlaylist(selectedPlaylist.id, song);
      
      // Update the displayed playlist songs
      setDisplayedPlaylistSongs(prev => [...prev, song]);
      
      // Show success message
      Alert.alert('Success', 'Song added to playlist');
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      Alert.alert('Error', 'Failed to add song to playlist');
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    try {
      await deletePlaylist(playlistId);
      Alert.alert('Success', 'Playlist deleted');
    } catch (error) {
      console.error('Error deleting playlist:', error);
      Alert.alert('Error', 'Failed to delete playlist');
    }
  };

  const handleRemoveSongFromPlaylist = async (playlistId: string, songId: string) => {
    try {
      await removeSongFromPlaylist(playlistId, songId);
      // Update the displayed playlist songs
      setDisplayedPlaylistSongs(prev => prev.filter(song => song.id !== songId));
    } catch (error) {
      console.error('Error removing song from playlist:', error);
      Alert.alert('Error', 'Failed to remove song from playlist');
    }
  };

  const fetchSongs = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('songlist_db')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching songs:', error);
        setError('Failed to load songs. Please try again later.');
        return;
      }

      if (!data || data.length === 0) {
        setError('No songs found in your library.');
        return;
      }

      setSongs(data);
      setError(null);
      setTotalSongs(data.length);
      setHasMoreSongs(false); // Since we're loading all songs at once
    } catch (error) {
      console.error('Error in fetchSongs:', error);
      setError('An unexpected error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderSong = ({ item }: { item: Song }) => (
    <TouchableOpacity 
      style={[
        styles.songItem,
        currentSongFromPlayer?.id === item.id && styles.activeSong,
      ]}
      onPress={() => handlePlayPause(item, true)}>
      <View style={styles.songContent}>
        <Image source={{ uri: item.cover_url }} style={styles.cover} />
        <View style={styles.songInfo}>
          <View style={styles.titleContainer}>
            <Animated.Text 
              style={[
                styles.title,
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
          <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
        </View>
      </View>
      <View style={styles.songActions}>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => handleToggleFavorite(item)}>
          <Heart 
            size={16} 
            color={isSongFavorite(item.id) ? '#FFA500' : '#b3b3b3'} 
            fill={isSongFavorite(item.id) ? '#FFA500' : 'none'} 
          />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => isSongDownloaded(item.id) ? removeFromDownloads(item.id) : downloadSong(item)}>
          <Download 
            size={16} 
            color={isSongDownloaded(item.id) ? '#1DB954' : '#b3b3b3'} 
          />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => handleAddSongToPlaylist(item)}>
          <ListMusic size={16} color="#1DB954" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.actionButton,
            isInQueue(item.id) && styles.queueButtonActive
          ]} 
          onPress={() => handleQueueToggle(item)}>
          {isInQueue(item.id) ? (
            <Minus size={20} color="#FF4444" />
          ) : (
            <Plus size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      {currentSongFromPlayer?.id === item.id && (
        <View style={styles.playingIndicator}>
          <View style={styles.playingDot} />
          <View style={styles.playingDot} />
          <View style={styles.playingDot} />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderPlaylist = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={styles.playlistItem}
      onPress={() => {
        setSelectedPlaylist(item);
        setDisplayedPlaylistSongs(item.songs.slice(0, pageSize));
        setShowPlaylistModal(true);
      }}>
      <FolderPlus size={24} color="#1DB954" />
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName}>{item.name}</Text>
        <Text style={styles.playlistCount}>{item.songs.length} songs</Text>
      </View>
      <View style={styles.playlistActions}>
        <TouchableOpacity
          style={styles.playlistActionButton}
          onPress={() => handleDeletePlaylist(item.id)}>
          <Trash2 size={20} color="#FF4444" />
        </TouchableOpacity>
        <ChevronRight size={20} color="#b3b3b3" />
      </View>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1DB954" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchSongs}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (showPlaylistModal && selectedPlaylist) {
      return (
        <View style={styles.playlistModalContainer}>
          <View style={styles.playlistModalHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setShowPlaylistModal(false);
                setSelectedPlaylist(null);
              }}>
              <ChevronRight size={24} color="#fff" style={styles.backIcon} />
            </TouchableOpacity>
            <Text style={styles.playlistModalTitle}>{selectedPlaylist.name}</Text>
            <View style={styles.playlistModalActions}>
              <TouchableOpacity
                style={styles.playlistModalActionButton}
                onPress={() => {
                  setShowPlaylistModal(false);
                  setSelectedPlaylist(null);
                }}>
                <X size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          
          {displayedPlaylistSongs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No songs in this playlist</Text>
            </View>
          ) : (
            <FlatList
              data={displayedPlaylistSongs}
              renderItem={renderSong}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              onEndReached={loadMorePlaylistSongs}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                isLoadingMorePlaylistSongs ? (
                  <View style={styles.loadingMoreContainer}>
                    <ActivityIndicator size="small" color="#1DB954" />
                    <Text style={styles.loadingMoreText}>Loading more songs...</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      );
    }

    return (
      <View style={styles.tabContainer}>
        <View style={styles.tabHeader}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'playlists' && styles.activeTabButton]}
            onPress={() => setActiveTab('playlists')}>
            <Text style={[styles.tabButtonText, activeTab === 'playlists' && styles.activeTabButtonText]}>
              Playlists
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'downloads' && styles.activeTabButton]}
            onPress={() => setActiveTab('downloads')}>
            <Text style={[styles.tabButtonText, activeTab === 'downloads' && styles.activeTabButtonText]}>
              Downloads
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'favorites' && styles.activeTabButton]}
            onPress={() => setActiveTab('favorites')}>
            <Text style={[styles.tabButtonText, activeTab === 'favorites' && styles.activeTabButtonText]}>
              Favorites
            </Text>
          </TouchableOpacity>
        </View>
        
        {activeTab === 'playlists' && (
          <View style={styles.playlistsContainer}>
            <TouchableOpacity
              style={styles.createPlaylistButton}
              onPress={() => setShowNewPlaylistInput(true)}>
              <Plus size={24} color="#1DB954" />
              <Text style={styles.createPlaylistText}>Create New Playlist</Text>
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
            
            {displayedPlaylists.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No playlists yet</Text>
              </View>
            ) : (
              <FlatList
                data={displayedPlaylists}
                renderItem={renderPlaylist}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                onEndReached={loadMoreItems}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isLoadingMore ? (
                    <View style={styles.loadingMoreContainer}>
                      <ActivityIndicator size="small" color="#1DB954" />
                      <Text style={styles.loadingMoreText}>Loading more playlists...</Text>
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        )}
        
        {activeTab === 'downloads' && (
          <View style={styles.downloadsContainer}>
            {displayedDownloads.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No downloaded songs yet</Text>
              </View>
            ) : (
              <FlatList
                data={displayedDownloads}
                renderItem={renderSong}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                onEndReached={loadMoreItems}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isLoadingMore ? (
                    <View style={styles.loadingMoreContainer}>
                      <ActivityIndicator size="small" color="#1DB954" />
                      <Text style={styles.loadingMoreText}>Loading more songs...</Text>
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        )}
        
        {activeTab === 'favorites' && (
          <View style={styles.favoritesContainer}>
            {displayedFavorites.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No favorite songs yet</Text>
              </View>
            ) : (
              <FlatList
                data={displayedFavorites}
                renderItem={renderSong}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                onEndReached={loadMoreItems}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isLoadingMore ? (
                    <View style={styles.loadingMoreContainer}>
                      <ActivityIndicator size="small" color="#1DB954" />
                      <Text style={styles.loadingMoreText}>Loading more songs...</Text>
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        )}
      </View>
    );
  };

  const loadMorePlaylistSongs = () => {
    if (isLoadingMorePlaylistSongs || !hasMorePlaylistSongs || !selectedPlaylist) return;
    
    setIsLoadingMorePlaylistSongs(true);
    
    // Calculate the next page of songs
    const nextPage = playlistPage + 1;
    const startIndex = (nextPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    // Get the next batch of songs
    const nextBatch = selectedPlaylist.songs.slice(startIndex, endIndex);
    
    // Update the displayed playlist songs
    setDisplayedPlaylistSongs(prev => [...prev, ...nextBatch]);
    
    // Update page and hasMoreSongs
    setPlaylistPage(nextPage);
    setHasMorePlaylistSongs(endIndex < selectedPlaylist.songs.length);
    
    setIsLoadingMorePlaylistSongs(false);
  };

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
          <Text style={styles.headerTitle}>Library</Text>
        </View>
      </View>
      
      {renderContent()}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#1DB954',
  },
  tabText: {
    color: '#b3b3b3',
    fontSize: 16,
  },
  activeTabText: {
    color: '#1DB954',
  },
  list: {
    padding: 20,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeSong: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
  },
  songContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cover: {
    width: 50,
    height: 50,
    borderRadius: 4,
  },
  songInfo: {
    marginLeft: 15,
    flex: 1,
  },
  titleContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  artist: {
    color: '#b3b3b3',
    fontSize: 14,
    marginTop: 4,
  },
  songActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
  },
  playingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  playingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1DB954',
    marginHorizontal: 2,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
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
  playlistActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistActionButton: {
    padding: 8,
  },
  playlistModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  playlistModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    transform: [{ rotate: '180deg' }],
  },
  playlistModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 10,
  },
  playlistModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistModalActionButton: {
    padding: 8,
  },
  tabContainer: {
    flex: 1,
  },
  tabHeader: {
    flexDirection: 'row',
    padding: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeTabButton: {
    borderBottomColor: '#1DB954',
  },
  tabButtonText: {
    color: '#b3b3b3',
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: '#1DB954',
  },
  playlistsContainer: {
    flex: 1,
  },
  createPlaylistButton: {
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
  createPlaylistText: {
    color: '#1DB954',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  downloadsContainer: {
    flex: 1,
  },
  favoritesContainer: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 18,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  queueButtonActive: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 4,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#b3b3b3',
    marginTop: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#b3b3b3',
    fontSize: 16,
    textAlign: 'center',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});