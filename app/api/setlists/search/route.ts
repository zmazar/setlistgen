import type { NextRequest } from "next/server";
import { errorResponse, HttpError } from "@/lib/http";
import { searchSetlists } from "@/lib/setlistfm";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const artist = params.get("artist")?.trim();
    if (!artist) throw new HttpError(400, "Missing ?artist=");
    const page = Math.max(1, Number(params.get("p")) || 1);
    return Response.json(await searchSetlists(artist, page));
  } catch (e) {
    return errorResponse(e);
  }
}
