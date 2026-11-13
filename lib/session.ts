import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { appUrl } from "./env";
import { HttpError } from "./http";
import { getProvider } from "./providers";
import type { ProviderId, StoredToken } from "./providers/types";

export type SessionData = {
  tokens?: Partial<Record<ProviderId, StoredToken>>;
  /** Pending OAuth handshake (CSRF state + where to return afterwards). */
  oauth?: { provider: ProviderId; state: string; returnTo: string };
};

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new HttpError(500, "SESSION_SECRET must be set in .env.local (at least 32 characters).");
  }
  return {
    cookieName: "setlistgen_session",
    password,
    ttl: 60 * 60 * 24 * 30,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: appUrl().startsWith("https://"),
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export type Session = Awaited<ReturnType<typeof getSession>>;

/** Returns a usable access token, refreshing (and persisting) it if it is about to expire. */
export async function getAccessToken(session: Session, id: ProviderId): Promise<string> {
  const provider = getProvider(id);
  const token = session.tokens?.[id];
  if (!token) throw new HttpError(401, `Not connected to ${provider.name}`);

  if (token.expiresAt && token.expiresAt - 60_000 < Date.now()) {
    if (!token.refreshToken || !provider.refresh) {
      await clearToken(session, id);
      throw new HttpError(401, `${provider.name} session expired; please reconnect`);
    }
    try {
      const refreshed = await provider.refresh(token);
      session.tokens = { ...session.tokens, [id]: refreshed };
      await session.save();
      return refreshed.accessToken;
    } catch (e) {
      await clearToken(session, id);
      throw new HttpError(401, `Could not refresh ${provider.name} session; please reconnect (${e instanceof Error ? e.message : e})`);
    }
  }
  return token.accessToken;
}

export async function clearToken(session: Session, id: ProviderId) {
  if (session.tokens) {
    const rest = { ...session.tokens };
    delete rest[id];
    session.tokens = rest;
    await session.save();
  }
}

/** Only allow same-origin relative paths as post-login destinations. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
