import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { getProvider } from "@/lib/providers";
import { getSession, safeReturnTo } from "@/lib/session";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/auth/[provider]/login">) {
  let url: string;
  try {
    const provider = getProvider((await ctx.params).provider);
    const state = crypto.randomUUID();
    const session = await getSession();
    session.oauth = {
      provider: provider.id,
      state,
      returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
    };
    await session.save();
    url = provider.authorizeUrl(state);
  } catch (e) {
    return errorResponse(e);
  }
  redirect(url);
}
