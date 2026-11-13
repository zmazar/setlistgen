import { redirect, unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import { getProvider } from "@/lib/providers";
import { getSession, safeReturnTo } from "@/lib/session";

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${base}?${params}`;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/auth/[provider]/callback">) {
  const { provider: providerId } = await ctx.params;
  const params = request.nextUrl.searchParams;
  const session = await getSession();
  const pending = session.oauth;
  const returnTo = safeReturnTo(pending?.returnTo);
  let destination: string;

  try {
    const provider = getProvider(providerId);
    session.oauth = undefined;

    const denied = params.get("error") ?? params.get("error_reason");
    if (denied) throw new Error(`${provider.name} authorization was denied (${denied})`);
    if (!pending || pending.provider !== provider.id || params.get("state") !== pending.state) {
      throw new Error("Login state mismatch. Please try connecting again.");
    }
    const code = params.get("code");
    if (!code) throw new Error(`${provider.name} did not return an authorization code`);

    const token = await provider.exchangeCode(code);
    session.tokens = { ...session.tokens, [provider.id]: token };
    await session.save();
    destination = withParam(returnTo, "connected", provider.id);
  } catch (e) {
    unstable_rethrow(e);
    await session.save();
    destination = withParam(returnTo, "authError", e instanceof Error ? e.message : String(e));
  }
  redirect(destination);
}
