import { describe, expect, it } from "vitest";
import { findMatch, normalizeArtist, normalizeTitle, pickBest, scoreCandidate } from "../match";
import type { MusicProvider, TrackCandidate } from "../providers/types";

const track = (title: string, artists: string[], album?: string, id = title): TrackCandidate => ({ id, title, artists, album });

describe("normalizeTitle", () => {
  it.each([
    ["Paranoid Android - Remastered 2009", "paranoid android"],
    ["Karma Police (Live)", "karma police"],
    ["Señorita [feat. Someone]", "senorita"],
    ["Rock & Roll", "rock and roll"],
    ["Don't Stop Me Now", "don t stop me now"],
    ["Song feat. Guest", "song"],
  ])("%s -> %s", (input, expected) => expect(normalizeTitle(input)).toBe(expected));
});

describe("normalizeArtist", () => {
  it("drops leading 'the' and punctuation", () => {
    expect(normalizeArtist("The Beatles")).toBe("beatles");
    expect(normalizeArtist("Simon & Garfunkel")).toBe("simon and garfunkel");
    expect(normalizeArtist("Sigur Rós")).toBe("sigur ros");
  });
});

describe("scoring", () => {
  const song = { artist: "Radiohead", title: "Creep" };

  it("prefers the studio version over live, karaoke and tribute versions", () => {
    const candidates = [
      track("Creep (Live)", ["Radiohead"], "Live at the Astoria", "live"),
      track("Creep", ["Karaoke Stars"], "Karaoke Hits", "karaoke"),
      track("Creep", ["Radiohead"], "Pablo Honey", "studio"),
    ];
    expect(pickBest(song, candidates)?.id).toBe("studio");
  });

  it("accepts a remaster as an exact match", () => {
    expect(scoreCandidate(song, track("Creep - Remastered", ["Radiohead"]))).toBeGreaterThan(0.95);
  });

  it("keeps a live version when the setlist asks for it", () => {
    const s = { artist: "Radiohead", title: "Creep (Live)" };
    expect(scoreCandidate(s, track("Creep (Live)", ["Radiohead"], "Live"))).toBeGreaterThan(0.95);
  });

  it("rejects wrong songs", () => {
    expect(pickBest(song, [track("Airbag", ["Radiohead"]), track("Creep", ["TLC"])])).toBeNull();
  });
});

describe("findMatch", () => {
  const fakeProvider = (strict: TrackCandidate[], loose: TrackCandidate[]) => {
    const calls: boolean[] = [];
    const provider = {
      search: async (_song: unknown, isStrict: boolean) => {
        calls.push(isStrict);
        return isStrict ? strict : loose;
      },
    } as unknown as MusicProvider;
    return { provider, calls };
  };

  it("stops after a good strict match", async () => {
    const { provider, calls } = fakeProvider([track("Creep", ["Radiohead"])], []);
    expect((await findMatch(provider, { artist: "Radiohead", title: "Creep" }, "t"))?.title).toBe("Creep");
    expect(calls).toEqual([true]);
  });

  it("falls back to a loose search", async () => {
    const { provider, calls } = fakeProvider([], [track("Creep", ["Radiohead"])]);
    expect(await findMatch(provider, { artist: "Radiohead", title: "Creep" }, "t")).not.toBeNull();
    expect(calls).toEqual([true, false]);
  });
});
