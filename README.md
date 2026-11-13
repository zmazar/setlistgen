# setlistgen

Turn a setlist.fm setlist into a Spotify (and, if you have an app, Deezer) playlist. Built for single-user, local use.

## Setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill it in:
   - `SESSION_SECRET`: any random string of 32+ characters.
   - `SETLISTFM_API_KEY`: from https://www.setlist.fm/settings/api
   - `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: from the Spotify dashboard. Add the redirect URI
     `http://127.0.0.1:3000/api/auth/spotify/callback` and add your account under **User Management**.
   - `DEEZER_APP_ID` / `DEEZER_SECRET`: optional. Deezer stays hidden in the UI until both are set.
3. `npm run dev` and open **http://127.0.0.1:3000**. Use `127.0.0.1`, not `localhost`, so the session cookie matches the OAuth redirect.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server (Webpack) on 127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Vitest unit tests (setlist parsing, track matching) |
| `npm run lint` | ESLint |

Webpack is used instead of Turbopack because Windows Application Control blocks Next's native SWC binary on this machine. Next falls back to WASM bindings, and Turbopack can't run on those.

## How it works

- `lib/setlistfm.ts`: setlist.fm client (throttled to ~2 req/s). Skips tapes and credits covers to the original artist.
- `lib/providers/`: one `MusicProvider` per service (OAuth, search, create playlist, add tracks).
  Spotify uses the post-Feb-2026 endpoints (`POST /me/playlists`, `POST /playlists/{id}/items`).
- `lib/match.ts`: normalizes titles and scores candidates on title and artist. It penalizes live, karaoke and tribute versions
  unless the setlist names them. It runs a strict field search, then falls back to a keyword search.
- OAuth tokens live in an encrypted httpOnly cookie (`iron-session`). There's no database.
