import { appUrl, requireEnv } from "../env";
import { fetchJson } from "../http";
import type { MusicProvider, StoredToken, TrackCandidate } from "./types";

// Endpoints reflect the Feb 2026 Web API changes:
// POST /me/playlists (not /users/{id}/playlists), POST /playlists/{id}/items (not /tracks),
// and /search `limit` max of 10.
const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const SCOPES = "playlist-modify-private playlist-modify-public";

const redirectUri = () => `${appUrl()}/api/auth/spotify/callback`;

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

async function requestToken(params: Record<string, string>, previous?: StoredToken): Promise<StoredToken> {
  const id = requireEnv("SPOTIFY_CLIENT_ID");
  const secret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const data = await fetchJson<TokenResponse>(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams(params),
  });
  return {
    accessToken: data.access_token,
    // Spotify may omit refresh_token on refresh; keep the old one.
    refreshToken: data.refresh_token ?? previous?.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

function api<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  return fetchJson<T>(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

type SpotifyTrack = {
  uri: string;
  name: string;
  artists: { name: string }[];
  album?: { name: string };
  external_urls?: { spotify?: string };
};

const stripQuotes = (s: string) => s.replace(/"/g, "");

export const spotify: MusicProvider = {
  id: "spotify",
  name: "Spotify",

  isConfigured: () => Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),

  authorizeUrl(state) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: requireEnv("SPOTIFY_CLIENT_ID"),
      scope: SCOPES,
      redirect_uri: redirectUri(),
      state,
    });
    return `${ACCOUNTS}/authorize?${params}`;
  },

  exchangeCode: (code) => requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),

  refresh(token) {
    if (!token.refreshToken) throw new Error("No Spotify refresh token");
    return requestToken({ grant_type: "refresh_token", refresh_token: token.refreshToken }, token);
  },

  async search({ artist, title }, strict, accessToken) {
    const q = strict ? `track:"${stripQuotes(title)}" artist:"${stripQuotes(artist)}"` : `${title} ${artist}`;
    const params = new URLSearchParams({ q, type: "track", limit: "10" });
    const data = await api<{ tracks: { items: SpotifyTrack[] } }>(`/search?${params}`, accessToken);
    return data.tracks.items.map(
      (t): TrackCandidate => ({
        id: t.uri,
        title: t.name,
        artists: t.artists.map((a) => a.name),
        album: t.album?.name,
        url: t.external_urls?.spotify,
      }),
    );
  },

  async createPlaylist(name, description, accessToken) {
    const data = await api<{ id: string; external_urls: { spotify: string } }>("/me/playlists", accessToken, {
      method: "POST",
      body: JSON.stringify({
        name: name.slice(0, 100),
        // Spotify rejects newlines in descriptions.
        description: description.replace(/\s+/g, " ").slice(0, 300),
        public: false,
      }),
    });
    return { id: data.id, url: data.external_urls.spotify };
  },

  async addTracks(playlistId, trackIds, accessToken) {
    for (let i = 0; i < trackIds.length; i += 100) {
      await api(`/playlists/${encodeURIComponent(playlistId)}/items`, accessToken, {
        method: "POST",
        body: JSON.stringify({ uris: trackIds.slice(i, i + 100) }),
      });
    }
  },
};
