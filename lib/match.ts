import type { MusicProvider, SongQuery, TrackCandidate, TrackMatch } from "./providers/types";

const stripAccents = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Normalize a track title for comparison: drop versions, brackets, featured artists, punctuation. */
export function normalizeTitle(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, " ") // "(Live)", "[Remastered 2011]"
    .replace(/\s[-–—]\s.*$/, "") // " - Remastered 2011", " - Live at ..."
    .replace(/\b(feat|ft|featuring)\b.*$/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeArtist(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^the /, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 0..1 similarity between two normalized strings. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const [short, long] = a.length < b.length ? [a, b] : [b, a];
    return 0.7 + 0.3 * (short.length / long.length);
  }
  // Dice coefficient over word tokens.
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

// Versions we'd rather not pick unless the setlist entry asks for them.
const PENALTIES: [RegExp, number][] = [
  [/\bkaraoke\b|\btribute\b|originally performed|in the style of|made famous|\blullaby\b|8[- ]bit/, 0.5],
  [/\binstrumental\b/, 0.3],
  [/\blive\b/, 0.15],
  [/\b(remix|mix|demo|acoustic|rehearsal|edit)\b/, 0.1],
];

export function scoreCandidate(song: SongQuery, c: TrackCandidate): number {
  const titleScore = similarity(normalizeTitle(song.title), normalizeTitle(c.title));
  const wantArtist = normalizeArtist(song.artist);
  const artistScore = Math.max(0, ...c.artists.map((a) => similarity(wantArtist, normalizeArtist(a))));
  // A same-titled song by someone else (or a different song by the right artist) is not a match.
  if (titleScore < 0.5 || artistScore < 0.5) return 0;

  const haystack = `${c.title} ${c.album ?? ""}`.toLowerCase();
  const wanted = song.title.toLowerCase();
  let penalty = 0;
  for (const [re, p] of PENALTIES) if (re.test(haystack) && !re.test(wanted)) penalty += p;

  return Math.max(0, 0.6 * titleScore + 0.4 * artistScore - penalty);
}

export const MIN_SCORE = 0.6;
const GOOD_SCORE = 0.85;

export function pickBest(song: SongQuery, candidates: TrackCandidate[]): TrackMatch | null {
  let best: TrackMatch | null = null;
  for (const c of candidates) {
    const score = scoreCandidate(song, c);
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { ...c, score };
  }
  return best;
}

/** Strict field search first; fall back to a loose keyword search if nothing good came back. */
export async function findMatch(provider: MusicProvider, song: SongQuery, accessToken: string): Promise<TrackMatch | null> {
  const strict = pickBest(song, await provider.search(song, true, accessToken));
  if (strict && strict.score >= GOOD_SCORE) return strict;
  const loose = pickBest(song, await provider.search(song, false, accessToken));
  if (!strict) return loose;
  if (!loose) return strict;
  return loose.score > strict.score ? loose : strict;
}
