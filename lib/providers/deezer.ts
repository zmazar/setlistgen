import { appUrl, requireEnv } from "../env";
import { fetchJson, HttpError } from "../http";
import type { MusicProvider, TrackCandidate } from "./types";

// Written against the public Deezer API docs; untested until a Deezer app is available.
const CONNECT = "https://connect.deezer.com/oauth";
const API = "https://api.deezer.com";
const PERMS = "basic_access,manage_library,offline_access";

const redirectUri = () => `${appUrl()}/api/auth/deezer/callback`;

type DeezerError = { error?: { type?: string; message?: string; code?: number } };

/** Deezer reports most errors as HTTP 200 with an `error` object. */
async function api<T>(path: string, params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<T> {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  const data = await fetchJson<T & DeezerError>(url, { method });
  if (data && typeof data === "object" && data.error) {
    const { code, message, type } = data.error;
    const status = code === 4 ? 429 : code === 200 || code === 300 || type === "OAuthException" ? 401 : code === 800 ? 404 : 502;
    throw new HttpError(status, `Deezer: ${message ?? type ?? "unknown error"}`);
  }
  return data;
}

type DeezerTrack = {
  id: number;
  title: string;
  link?: string;
  artist: { name: string };
  album?: { title: string };
};

export const deezer: MusicProvider = {
  id: "deezer",
  name: "Deezer",

  isConfigured: () => Boolean(process.env.DEEZER_APP_ID && process.env.DEEZER_SECRET),

  authorizeUrl(state) {
    const params = new URLSearchParams({
      app_id: requireEnv("DEEZER_APP_ID"),
      redirect_uri: redirectUri(),
      perms: PERMS,
      state,
    });
    return `${CONNECT}/auth.php?${params}`;
  },

  async exchangeCode(code) {
    const params = new URLSearchParams({
      app_id: requireEnv("DEEZER_APP_ID"),
      secret: requireEnv("DEEZER_SECRET"),
      code,
      output: "json",
    });
    let data: { access_token?: string; expires?: number | string };
    try {
      data = await fetchJson(`${CONNECT}/access_token.php?${params}`);
    } catch (e) {
      throw new HttpError(401, `Deezer token exchange failed: ${e instanceof Error ? e.message : e}`);
    }
    if (!data?.access_token) throw new HttpError(401, "Deezer token exchange failed");
    const expires = Number(data.expires) || 0; // 0 => never expires (offline_access)
    return { accessToken: data.access_token, expiresAt: expires > 0 ? Date.now() + expires * 1000 : undefined };
  },

  async search({ artist, title }, strict) {
    const clean = (s: string) => s.replace(/"/g, "");
    const q = strict ? `artist:"${clean(artist)}" track:"${clean(title)}"` : `${artist} ${title}`;
    const data = await api<{ data: DeezerTrack[] }>("/search", { q, limit: "10" });
    return (data.data ?? []).map(
      (t): TrackCandidate => ({
        id: String(t.id),
        title: t.title,
        artists: [t.artist.name],
        album: t.album?.title,
        url: t.link,
      }),
    );
  },

  async createPlaylist(name, _description, accessToken) {
    const data = await api<{ id: number }>("/user/me/playlists", { title: name.slice(0, 100), access_token: accessToken }, "POST");
    return { id: String(data.id), url: `https://www.deezer.com/playlist/${data.id}` };
  },

  async addTracks(playlistId, trackIds, accessToken) {
    for (let i = 0; i < trackIds.length; i += 50) {
      await api(
        `/playlist/${encodeURIComponent(playlistId)}/tracks`,
        { songs: trackIds.slice(i, i + 50).join(","), access_token: accessToken },
        "POST",
      );
    }
  },
};
