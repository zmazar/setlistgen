export type ProviderId = "spotify" | "deezer";

export const PROVIDER_IDS: ProviderId[] = ["spotify", "deezer"];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as string[]).includes(value);
}

export type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms; undefined means the token does not expire. */
  expiresAt?: number;
};

export type SongQuery = { artist: string; title: string };

export type TrackCandidate = {
  /** The identifier the provider needs to add the track to a playlist (Spotify URI, Deezer track id). */
  id: string;
  title: string;
  artists: string[];
  album?: string;
  url?: string;
};

export type TrackMatch = TrackCandidate & { score: number };

export interface MusicProvider {
  id: ProviderId;
  name: string;
  isConfigured(): boolean;
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<StoredToken>;
  refresh?(token: StoredToken): Promise<StoredToken>;
  /** `strict` uses field filters (artist:/track:); loose is a plain keyword search. */
  search(song: SongQuery, strict: boolean, accessToken: string): Promise<TrackCandidate[]>;
  createPlaylist(name: string, description: string, accessToken: string): Promise<{ id: string; url: string }>;
  addTracks(playlistId: string, trackIds: string[], accessToken: string): Promise<void>;
}
