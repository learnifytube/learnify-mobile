import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  RemoteChannel,
  RemotePlaylist,
  RemoteFavorite,
  RemoteVideoWithStatus,
  ServerDownloadStatus,
  RemoteMyList,
  BrowseTab,
} from "../types";
import { api } from "../services/api";

type FavoriteEntityType = "video" | "custom_playlist" | "channel_playlist";

type SyncTab = BrowseTab;

interface SyncStore {
  // Tab state
  activeTab: SyncTab;
  setActiveTab: (tab: SyncTab) => void;

  // Loading states
  isLoadingChannels: boolean;
  isLoadingPlaylists: boolean;
  isLoadingFavorites: boolean;
  isLoadingVideos: boolean;
  isLoadingSubscriptions: boolean;
  isLoadingMyLists: boolean;

  // Error states
  channelsError: string | null;
  playlistsError: string | null;
  favoritesError: string | null;
  videosError: string | null;
  subscriptionsError: string | null;
  myListsError: string | null;

  // Data
  channels: RemoteChannel[];
  playlists: RemotePlaylist[];
  favorites: RemoteFavorite[];
  myLists: RemoteMyList[];
  channelVideosCache: Record<string, RemoteVideoWithStatus[]>;
  playlistVideosCache: Record<string, RemoteVideoWithStatus[]>;
  myListVideosCache: Record<string, RemoteVideoWithStatus[]>;

  // Selected item + its videos
  selectedChannel: RemoteChannel | null;
  channelVideos: RemoteVideoWithStatus[];
  selectedPlaylist: RemotePlaylist | null;
  playlistVideos: RemoteVideoWithStatus[];
  subscriptionVideos: RemoteVideoWithStatus[];
  selectedMyList: RemoteMyList | null;
  myListVideos: RemoteVideoWithStatus[];

  // Server download tracking
  serverDownloadRequests: Map<string, ServerDownloadStatus>;

  // Selection for batch operations
  selectedVideoIds: Set<string>;

  // Track favorited playlist IDs for quick lookup
  favoritePlaylistIds: Set<string>;

  // Actions
  fetchChannels: (serverUrl: string) => Promise<void>;
  fetchPlaylists: (serverUrl: string) => Promise<void>;
  fetchFavorites: (serverUrl: string) => Promise<void>;
  fetchChannelVideos: (serverUrl: string, channel: RemoteChannel) => Promise<void>;
  fetchPlaylistVideos: (serverUrl: string, playlist: RemotePlaylist) => Promise<void>;
  fetchSubscriptions: (serverUrl: string) => Promise<void>;
  fetchMyLists: (serverUrl: string) => Promise<void>;
  fetchMyListVideos: (serverUrl: string, myList: RemoteMyList) => Promise<void>;

  selectChannel: (channel: RemoteChannel | null) => void;
  selectPlaylist: (playlist: RemotePlaylist | null) => void;
  selectMyList: (myList: RemoteMyList | null) => void;

  toggleVideoSelection: (videoId: string) => void;
  selectAllVideos: () => void;
  clearVideoSelection: () => void;

  updateServerDownloadStatus: (videoId: string, status: ServerDownloadStatus) => void;
  clearServerDownloadStatus: (videoId: string) => void;

  // Favorites management
  addToFavorites: (
    serverUrl: string,
    entityType: FavoriteEntityType,
    entityId: string
  ) => Promise<void>;
  removeFromFavorites: (
    serverUrl: string,
    entityType: FavoriteEntityType,
    entityId: string
  ) => Promise<void>;

  reset: () => void;
}

interface SyncCacheState {
  activeTab: SyncTab;
  channels: RemoteChannel[];
  playlists: RemotePlaylist[];
  myLists: RemoteMyList[];
  subscriptionVideos: RemoteVideoWithStatus[];
  channelVideosCache: Record<string, RemoteVideoWithStatus[]>;
  playlistVideosCache: Record<string, RemoteVideoWithStatus[]>;
  myListVideosCache: Record<string, RemoteVideoWithStatus[]>;
}

const initialState = {
  activeTab: "mylists" as SyncTab,
  isLoadingChannels: false,
  isLoadingPlaylists: false,
  isLoadingFavorites: false,
  isLoadingVideos: false,
  isLoadingSubscriptions: false,
  isLoadingMyLists: false,
  channelsError: null,
  playlistsError: null,
  favoritesError: null,
  videosError: null,
  subscriptionsError: null,
  myListsError: null,
  channels: [],
  playlists: [],
  favorites: [],
  myLists: [],
  channelVideosCache: {},
  playlistVideosCache: {},
  myListVideosCache: {},
  selectedChannel: null,
  channelVideos: [],
  selectedPlaylist: null,
  playlistVideos: [],
  subscriptionVideos: [],
  selectedMyList: null,
  myListVideos: [],
  serverDownloadRequests: new Map<string, ServerDownloadStatus>(),
  selectedVideoIds: new Set<string>(),
  favoritePlaylistIds: new Set<string>(),
};

export const useSyncStore = create<SyncStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveTab: (tab) => {
        set({
          activeTab: tab,
          selectedChannel: null,
          channelVideos: [],
          selectedPlaylist: null,
          playlistVideos: [],
          selectedMyList: null,
          myListVideos: [],
          selectedVideoIds: new Set(),
          videosError: null,
        });
      },

      fetchChannels: async (serverUrl) => {
        set({ isLoadingChannels: true, channelsError: null });
        try {
          const { channels } = await api.getChannels(serverUrl);
          set({ channels, isLoadingChannels: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch channels";
          const hasCachedChannels = get().channels.length > 0;
          set({
            channelsError: hasCachedChannels ? null : message,
            isLoadingChannels: false,
          });
        }
      },

      fetchPlaylists: async (serverUrl) => {
        set({ isLoadingPlaylists: true, playlistsError: null });
        try {
          const { playlists } = await api.getPlaylists(serverUrl);
          set({ playlists, isLoadingPlaylists: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch playlists";
          const hasCachedPlaylists = get().playlists.length > 0;
          set({
            playlistsError: hasCachedPlaylists ? null : message,
            isLoadingPlaylists: false,
          });
        }
      },

      fetchFavorites: async (serverUrl) => {
        set({ isLoadingFavorites: true, favoritesError: null });
        try {
          const { favorites } = await api.getFavorites(serverUrl);
          // Build set of favorited playlist IDs for quick lookup
          const favoritePlaylistIds = new Set<string>();
          for (const fav of favorites) {
            if (fav.entityType === "channel_playlist" || fav.entityType === "custom_playlist") {
              favoritePlaylistIds.add(fav.entityId);
            }
          }
          set({ favorites, favoritePlaylistIds, isLoadingFavorites: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch favorites";
          set({ favoritesError: message, isLoadingFavorites: false });
        }
      },

      fetchChannelVideos: async (serverUrl, channel) => {
        const cachedVideos = get().channelVideosCache[channel.channelId] ?? [];
        set({
          isLoadingVideos: true,
          videosError: null,
          selectedChannel: channel,
          selectedPlaylist: null,
          selectedMyList: null,
          channelVideos: cachedVideos,
          playlistVideos: [],
          myListVideos: [],
          selectedVideoIds: new Set(),
        });
        try {
          const { videos } = await api.getChannelVideos(serverUrl, channel.channelId);
          set((state) => ({
            channelVideos: videos,
            channelVideosCache: {
              ...state.channelVideosCache,
              [channel.channelId]: videos,
            },
            isLoadingVideos: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch videos";
          set({
            videosError: cachedVideos.length > 0 ? null : message,
            isLoadingVideos: false,
            channelVideos: cachedVideos,
          });
        }
      },

      fetchPlaylistVideos: async (serverUrl, playlist) => {
        const cachedVideos = get().playlistVideosCache[playlist.playlistId] ?? [];
        set({
          isLoadingVideos: true,
          videosError: null,
          selectedPlaylist: playlist,
          selectedChannel: null,
          selectedMyList: null,
          playlistVideos: cachedVideos,
          channelVideos: [],
          myListVideos: [],
          selectedVideoIds: new Set(),
        });
        try {
          const { videos } = await api.getPlaylistVideos(serverUrl, playlist.playlistId);
          set((state) => ({
            playlistVideos: videos,
            playlistVideosCache: {
              ...state.playlistVideosCache,
              [playlist.playlistId]: videos,
            },
            isLoadingVideos: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch videos";
          set({
            videosError: cachedVideos.length > 0 ? null : message,
            isLoadingVideos: false,
            playlistVideos: cachedVideos,
          });
        }
      },

      fetchSubscriptions: async (serverUrl) => {
        set({ isLoadingSubscriptions: true, subscriptionsError: null });
        try {
          const { videos } = await api.getSubscriptions(serverUrl);
          set({ subscriptionVideos: videos, isLoadingSubscriptions: false });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to fetch subscriptions";
          const hasCachedSubscriptions = get().subscriptionVideos.length > 0;
          set({
            subscriptionsError: hasCachedSubscriptions ? null : message,
            isLoadingSubscriptions: false,
          });
        }
      },

      fetchMyLists: async (serverUrl) => {
        set({ isLoadingMyLists: true, myListsError: null });
        try {
          const { mylists } = await api.getMyLists(serverUrl);
          set({ myLists: mylists, isLoadingMyLists: false });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to fetch my lists";
          const hasCachedMyLists = get().myLists.length > 0;
          set({
            myListsError: hasCachedMyLists ? null : message,
            isLoadingMyLists: false,
          });
        }
      },

      fetchMyListVideos: async (serverUrl, myList) => {
        const cachedVideos = get().myListVideosCache[myList.id] ?? [];
        set({
          isLoadingVideos: true,
          videosError: null,
          selectedMyList: myList,
          selectedChannel: null,
          selectedPlaylist: null,
          myListVideos: cachedVideos,
          channelVideos: [],
          playlistVideos: [],
          selectedVideoIds: new Set(),
        });
        try {
          const { videos } = await api.getMyListVideos(serverUrl, myList.id);
          set((state) => ({
            myListVideos: videos,
            myListVideosCache: {
              ...state.myListVideosCache,
              [myList.id]: videos,
            },
            isLoadingVideos: false,
          }));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to fetch videos";
          set({
            videosError: cachedVideos.length > 0 ? null : message,
            isLoadingVideos: false,
            myListVideos: cachedVideos,
          });
        }
      },

      selectChannel: (channel) => {
        const channelVideos = channel
          ? get().channelVideosCache[channel.channelId] ?? []
          : [];
        set({
          selectedChannel: channel,
          selectedPlaylist: null,
          selectedMyList: null,
          channelVideos,
          playlistVideos: [],
          myListVideos: [],
          selectedVideoIds: new Set(),
          videosError: null,
          isLoadingVideos: false,
        });
      },

      selectPlaylist: (playlist) => {
        const playlistVideos = playlist
          ? get().playlistVideosCache[playlist.playlistId] ?? []
          : [];
        set({
          selectedPlaylist: playlist,
          selectedChannel: null,
          selectedMyList: null,
          playlistVideos,
          channelVideos: [],
          myListVideos: [],
          selectedVideoIds: new Set(),
          videosError: null,
          isLoadingVideos: false,
        });
      },

      selectMyList: (myList) => {
        const myListVideos = myList
          ? get().myListVideosCache[myList.id] ?? []
          : [];
        set({
          selectedMyList: myList,
          selectedChannel: null,
          selectedPlaylist: null,
          myListVideos,
          channelVideos: [],
          playlistVideos: [],
          selectedVideoIds: new Set(),
          videosError: null,
          isLoadingVideos: false,
        });
      },

      toggleVideoSelection: (videoId) => {
        const { selectedVideoIds } = get();
        const newSelection = new Set(selectedVideoIds);
        if (newSelection.has(videoId)) {
          newSelection.delete(videoId);
        } else {
          newSelection.add(videoId);
        }
        set({ selectedVideoIds: newSelection });
      },

      selectAllVideos: () => {
        const {
          activeTab,
          channelVideos,
          playlistVideos,
          subscriptionVideos,
          myListVideos,
        } = get();
        let videos: RemoteVideoWithStatus[] = [];
        if (activeTab === "channels") videos = channelVideos;
        else if (activeTab === "playlists") videos = playlistVideos;
        else if (activeTab === "subscriptions") videos = subscriptionVideos;
        else if (activeTab === "mylists") videos = myListVideos;
        const downloadableVideos = videos.filter((v) => v.downloadStatus === "completed");
        set({ selectedVideoIds: new Set(downloadableVideos.map((v) => v.id)) });
      },

      clearVideoSelection: () => {
        set({ selectedVideoIds: new Set() });
      },

      updateServerDownloadStatus: (videoId, status) => {
        const { serverDownloadRequests } = get();
        const newMap = new Map(serverDownloadRequests);
        newMap.set(videoId, status);
        set({ serverDownloadRequests: newMap });
      },

      clearServerDownloadStatus: (videoId) => {
        const { serverDownloadRequests } = get();
        const newMap = new Map(serverDownloadRequests);
        newMap.delete(videoId);
        set({ serverDownloadRequests: newMap });
      },

      addToFavorites: async (serverUrl, entityType, entityId) => {
        try {
          await api.addFavorite(serverUrl, entityType, entityId);
          // Update local state
          const { favoritePlaylistIds } = get();
          if (entityType === "channel_playlist" || entityType === "custom_playlist") {
            const newSet = new Set(favoritePlaylistIds);
            newSet.add(entityId);
            set({ favoritePlaylistIds: newSet });
          }
          // Refresh favorites list
          const { favorites: currentFavorites } = await api.getFavorites(serverUrl);
          const newFavoritePlaylistIds = new Set<string>();
          for (const fav of currentFavorites) {
            if (fav.entityType === "channel_playlist" || fav.entityType === "custom_playlist") {
              newFavoritePlaylistIds.add(fav.entityId);
            }
          }
          set({ favorites: currentFavorites, favoritePlaylistIds: newFavoritePlaylistIds });
        } catch (error) {
          console.error("[SyncStore] Failed to add favorite:", error);
          throw error;
        }
      },

      removeFromFavorites: async (serverUrl, entityType, entityId) => {
        try {
          await api.removeFavorite(serverUrl, entityType, entityId);
          // Update local state immediately
          const { favoritePlaylistIds, favorites } = get();
          if (entityType === "channel_playlist" || entityType === "custom_playlist") {
            const newSet = new Set(favoritePlaylistIds);
            newSet.delete(entityId);
            set({ favoritePlaylistIds: newSet });
          }
          // Remove from favorites list
          const newFavorites = favorites.filter(
            (f) => !(f.entityType === entityType && f.entityId === entityId)
          );
          set({ favorites: newFavorites });
        } catch (error) {
          console.error("[SyncStore] Failed to remove favorite:", error);
          throw error;
        }
      },

      reset: () => {
        set({
          ...initialState,
          serverDownloadRequests: new Map(),
          selectedVideoIds: new Set(),
          favoritePlaylistIds: new Set(),
        });
      },
    }),
    {
      name: "learnify-sync-cache",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): SyncCacheState => ({
        activeTab: state.activeTab,
        channels: state.channels,
        playlists: state.playlists,
        myLists: state.myLists,
        subscriptionVideos: state.subscriptionVideos,
        channelVideosCache: state.channelVideosCache,
        playlistVideosCache: state.playlistVideosCache,
        myListVideosCache: state.myListVideosCache,
      }),
    }
  )
);
