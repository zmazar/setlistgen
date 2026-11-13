import { errorResponse } from "@/lib/http";
import { getProvider } from "@/lib/providers";
import { clearToken, getSession } from "@/lib/session";

export async function POST(_request: Request, ctx: RouteContext<"/api/auth/[provider]/logout">) {
  try {
    const provider = getProvider((await ctx.params).provider);
    await clearToken(await getSession(), provider.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
