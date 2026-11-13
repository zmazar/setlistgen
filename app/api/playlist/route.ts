import { errorResponse, HttpError } from "@/lib/http";
import { getProvider } from "@/lib/providers";
import { getAccessToken, getSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = getProvider(body.provider);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description : "";
    const trackIds: unknown = body.trackIds;
    if (!name) throw new HttpError(400, "Playlist name is required");
    if (!Array.isArray(trackIds) || trackIds.length === 0 || !trackIds.every((t) => typeof t === "string" && t)) {
      throw new HttpError(400, "trackIds must be a non-empty array of strings");
    }

    const token = await getAccessToken(await getSession(), provider.id);
    const playlist = await provider.createPlaylist(name, description, token);
    await provider.addTracks(playlist.id, trackIds as string[], token);
    return Response.json({ ...playlist, added: trackIds.length });
  } catch (e) {
    return errorResponse(e);
  }
}
