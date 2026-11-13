import { requireEnv } from "./env";
import { fetchJson, HttpError, sleep } from "./http";

const API = "https://api.setlist.fm/rest/1.0";

// --- Raw API types (subset) ---

export type SetlistFmSong = {
  name: string;
  info?: string;
  tape?: boolean;
  cover?: { name: string };
  with?: { name: string };
};

export type SetlistFmSetlist = {
  id: string;
  eventDate: string; // dd-MM-yyyy
  url?: string;
  artist: { mbid?: string; name: string };
  venue?: { name?: string; city?: { name?: string; state?: string; country?: { name?: string } } };
  tour?: { name: string };
  sets?: { set?: { name?: string; encore?: number; song?: SetlistFmSong[] }[] };
};

type SearchResponse = { setlist?: SetlistFmSetlist[]; total: number; page: number; itemsPerPage: number };

// --- App-facing types ---

export type Song = {
  title: string;
  /** The artist to search for: the original artist for covers, otherwise the performer. */
  artist: string;
  isCover: boolean;
  info?: string;
  setName?: string;
};

export type SetlistSummary = {
  id: string;
  artist: string;
  date: string; // yyyy-MM-dd
  venue: string;
  city: string;
  country: string;
  tour?: string;
  songCount: number;
  url?: string;
};

// setlist.fm allows ~2 requests/second per key; serialize calls with a minimum gap.
const MIN_GAP_MS = 600;
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

function call<T>(path: string): Promise<T> {
  return throttled(() =>
    fetchJson<T>(`${API}${path}`, {
      headers: { "x-api-key": requireEnv("SETLISTFM_API_KEY"), Accept: "application/json", "Accept-Language": "en" },
    }),
  );
}

export async function searchSetlists(artistName: string, page = 1) {
  const params = new URLSearchParams({ artistName, p: String(page) });
  try {
    const data = await call<SearchResponse>(`/search/setlists?${params}`);
    const setlists = (data.setlist ?? []).map(summarize);
    return { setlists, total: data.total, page: data.page, itemsPerPage: data.itemsPerPage };
  } catch (e) {
    // setlist.fm answers "no results" with a 404.
    if (e instanceof HttpError && e.status === 404) return { setlists: [], total: 0, page, itemsPerPage: 20 };
    throw e;
  }
}

export async function getSetlist(id: string) {
  const raw = await call<SetlistFmSetlist>(`/setlist/${encodeURIComponent(id)}`);
  return { summary: summarize(raw), songs: flattenSongs(raw) };
}

export function flattenSongs(setlist: SetlistFmSetlist): Song[] {
  const songs: Song[] = [];
  for (const set of setlist.sets?.set ?? []) {
    const setName = set.name || (set.encore ? (set.encore > 1 ? `Encore ${set.encore}` : "Encore") : undefined);
    for (const song of set.song ?? []) {
      const title = song.name?.trim();
      // Tapes are intro/outro recordings played over the PA, not performed songs.
      if (!title || song.tape) continue;
      songs.push({
        title,
        artist: song.cover?.name ?? setlist.artist.name,
        isCover: Boolean(song.cover),
        info: song.info,
        setName,
      });
    }
  }
  return songs;
}

/** dd-MM-yyyy -> yyyy-MM-dd */
export function isoDate(eventDate: string): string {
  const [d, m, y] = eventDate.split("-");
  return y && m && d ? `${y}-${m}-${d}` : eventDate;
}

function summarize(s: SetlistFmSetlist): SetlistSummary {
  return {
    id: s.id,
    artist: s.artist.name,
    date: isoDate(s.eventDate),
    venue: s.venue?.name ?? "",
    city: s.venue?.city?.name ?? "",
    country: s.venue?.city?.country?.name ?? "",
    tour: s.tour?.name,
    songCount: flattenSongs(s).length,
    url: s.url,
  };
}
