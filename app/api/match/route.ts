import { errorResponse, HttpError, mapLimit } from "@/lib/http";
import { findMatch } from "@/lib/match";
import { getProvider } from "@/lib/providers";
import type { SongQuery, TrackMatch } from "@/lib/providers/types";
import { getAccessToken, getSession } from "@/lib/session";

export type MatchResult = { match: TrackMatch | null; error?: string };

function parseSongs(value: unknown): SongQuery[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new HttpError(400, "songs must be an array of 1-200 items");
  }
  return value.map((s) => {
    const artist = typeof s?.artist === "string" ? s.artist.trim() : "";
    const title = typeof s?.title === "string" ? s.title.trim() : "";
    if (!artist || !title) throw new HttpError(400, "Each song needs an artist and a title");
    return { artist, title };
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = getProvider(body.provider);
    const songs = parseSongs(body.songs);
    const token = await getAccessToken(await getSession(), provider.id);

    const results = await mapLimit(songs, 3, async (song): Promise<MatchResult> => {
      try {
        return { match: await findMatch(provider, song, token) };
      } catch (e) {
        // Auth and rate-limit failures affect every song; fail the whole request.
        if (e instanceof HttpError && (e.status === 401 || e.status === 403 || e.status === 429)) throw e;
        return { match: null, error: e instanceof Error ? e.message : String(e) };
      }
    });
    return Response.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
