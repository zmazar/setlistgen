import { errorResponse } from "@/lib/http";
import { providers } from "@/lib/providers";
import { getSession } from "@/lib/session";

export type ProviderStatus = { id: string; name: string; configured: boolean; connected: boolean };

export async function GET() {
  try {
    const session = await getSession();
    const status: ProviderStatus[] = Object.values(providers).map((p) => ({
      id: p.id,
      name: p.name,
      configured: p.isConfigured(),
      connected: p.isConfigured() && Boolean(session.tokens?.[p.id]),
    }));
    return Response.json({ providers: status });
  } catch (e) {
    return errorResponse(e);
  }
}
