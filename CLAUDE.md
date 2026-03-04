# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm start              # Start Expo dev server
npm run android        # Run on Android Emulator

# Code quality
npm run type-check     # TypeScript type checking
npm run lint           # ESLint

# Building
npx expo prebuild      # Generate native projects
```

## Architecture

This is a React Native + Expo mobile app that syncs and plays downloaded YouTube videos from a LearnifyTube desktop companion app over local WiFi.

### Core Data Flow

1. **Connection**: User enters desktop server IP → `useConnectionStore` persists connection
2. **Sync**: App fetches video list via `api.ts` → queued in `useDownloadStore` → processed by `downloadManager.ts` → stored in `useLibraryStore`
3. **Playback**: Videos play from local storage with synchronized transcript auto-scrolling

### Key Modules

- **`services/api.ts`**: REST client for desktop server (`/api/info`, `/api/videos`, `/api/video/:id/*`, `/api/video/:id/transcripts`)
- **`services/downloader.ts`**: Uses expo-file-system SDK 54+ `Paths`/`Directory`/`File` API for video downloads with progress tracking
- **`services/downloadManager.ts`**: Singleton queue processor with concurrency (max 2), retry logic (exponential backoff), and cancellation support
- **`services/p2p/`**: mDNS discovery via react-native-zeroconf for device-to-device sharing
- **`db/`**: SQLite database with Drizzle ORM
  - `schema.ts`: Database schema (videos, transcripts, translation_cache, saved_words, flashcards, watch_stats)
  - `migrate.ts`: Migration runner that initializes tables on app start
  - `repositories/videos.ts`: CRUD operations for videos and transcripts
- **`stores/`**: Zustand stores (library backed by SQLite, others use AsyncStorage)
  - `library.ts`: Video collection state (synced to SQLite)
  - `connection.ts`: Server connection state
  - `downloads.ts`: Download queue with status tracking (queued/downloading/completed/failed)
- **`hooks/useDownloadProcessor.ts`**: Root-level hook that drives queue processing
- **`hooks/useDatabase.ts`**: Initializes SQLite and runs migrations on app start

### Routing (Expo Router)

- `app/index.tsx` - Library screen (home)
- `app/connect.tsx` - Desktop connection modal
- `app/player/[id].tsx` - Video player with interactive transcript
- `app/share.tsx` - P2P device sharing modal

### Video Player

Uses `expo-video` with:
- `useVideoPlayer` hook for playback control
- Real-time `timeUpdate` events for transcript synchronization
- Tap-to-seek on transcript segments

### Download System

The download system uses a queue-based architecture:
- Downloads are queued in `useDownloadStore`, processed by `downloadManager`
- Max 2 concurrent downloads, 3 retries with exponential backoff (1s, 3s, 10s)
- AbortController for cancellation with partial file cleanup
- Progress updates throttled to 250ms to avoid UI spam
- Queue persists across app restarts (downloading items reset to queued on hydration)
- Downloads fetch all available transcripts (multiple languages) from the desktop server

**Important: Video Path Resolution**
- App sandbox container paths can change when the app is reinstalled or updated
- Never use stored `localPath` directly for playback - use `getVideoLocalPath(videoId)` from `services/downloader.ts`
- Use `videoExistsLocally(videoId)` to check if a video file exists locally
- The `localPath` in the database is kept for backwards compatibility but should not be trusted

### Database (SQLite + Drizzle)

The app uses SQLite via expo-sqlite with Drizzle ORM for local data persistence:
- **videos**: Core video metadata (id, title, channel, duration, localPath)
- **transcripts**: Multiple languages per video with segments JSON
- **translation_cache**: Word/phrase translations with learning stats
- **translation_contexts**: Links translations to video timestamps
- **saved_words**: User's vocabulary learning list
- **flashcards**: Spaced repetition cards (SM-2 algorithm)
- **watch_stats**: Playback progress tracking

Migrations run automatically on app start via `useDatabase` hook.

## Theme System

The mobile app uses a centralized theme system that matches the electron desktop app's dark mode styling.

### Theme Files (`theme/`)

- **`colors.ts`**: All color definitions matching the electron app's dark mode palette
  - Core: `background`, `card`, `muted`, `foreground`, `mutedForeground`
  - Brand: `primary` (#60A5FA blue), `accent` (#12D594 green)
  - Semantic: `success`, `warning`, `destructive`, `pending`
  - Helpers: `spacing`, `radius`, `fontSize`, `fontWeight`, `getPlaceholderColor()`
- **`icons.ts`**: Centralized icon exports from `lucide-react-native` (matches desktop's `lucide-react`)
- **`index.ts`**: Barrel export for all theme utilities

### Usage

```typescript
import { colors, spacing, radius, fontSize, fontWeight } from "../theme";
import { Check, Play, ArrowLeft } from "../theme/icons";

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  title: {
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
```

### Key Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | #0A0F1A | Main app background |
| `card` | #151B28 | Card/surface backgrounds |
| `foreground` | #F8FAFC | Primary text |
| `mutedForeground` | #ADB5C4 | Secondary text |
| `primary` | #60A5FA | Primary actions, links |
| `success` | #12D594 | Success states, completed |
| `destructive` | #F87171 | Errors, delete actions |
| `border` | #323B4E | Borders, dividers |

## Tech Stack

- Expo SDK 55 with New Architecture enabled
- React 19 / React Native 0.83
- expo-router for file-based routing (typed routes enabled)
- expo-sqlite + drizzle-orm for local database
- Zustand for state management
- expo-video for playback
- expo-file-system (SDK 54+ Paths API)
- react-native-zeroconf for mDNS discovery
- lucide-react-native for icons (matches desktop's lucide-react)
- react-native-svg (peer dependency for lucide icons)
