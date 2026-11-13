import { HttpError } from "../http";
import { deezer } from "./deezer";
import { spotify } from "./spotify";
import { isProviderId, type MusicProvider } from "./types";

export const providers: Record<MusicProvider["id"], MusicProvider> = { spotify, deezer };

/** Resolve a provider from untrusted input; throws 404 for unknown and 400 for unconfigured ones. */
export function getProvider(id: unknown): MusicProvider {
  if (!isProviderId(id)) throw new HttpError(404, `Unknown provider: ${String(id)}`);
  const provider = providers[id];
  if (!provider.isConfigured()) throw new HttpError(400, `${provider.name} is not configured on the server`);
  return provider;
}
