import { describe, expect, it } from "vitest";
import { flattenSongs, isoDate, type SetlistFmSetlist } from "../setlistfm";

const sample: SetlistFmSetlist = {
  id: "abc123",
  eventDate: "23-08-2025",
  artist: { name: "Radiohead" },
  venue: { name: "Some Arena", city: { name: "London", country: { name: "United Kingdom" } } },
  sets: {
    set: [
      {
        song: [
          { name: "Intro Music", tape: true },
          { name: "Airbag" },
          { name: "Paranoid Android", info: "Extended outro" },
          { name: "" },
        ],
      },
      {
        encore: 1,
        song: [{ name: "Ceremony", cover: { name: "Joy Division" } }, { name: "Karma Police" }],
      },
      { encore: 2, song: [{ name: "Creep" }] },
    ],
  },
};

describe("flattenSongs", () => {
  const songs = flattenSongs(sample);

  it("skips tapes and blank entries", () => {
    expect(songs.map((s) => s.title)).toEqual(["Airbag", "Paranoid Android", "Ceremony", "Karma Police", "Creep"]);
  });

  it("credits covers to the original artist", () => {
    const ceremony = songs.find((s) => s.title === "Ceremony")!;
    expect(ceremony.artist).toBe("Joy Division");
    expect(ceremony.isCover).toBe(true);
    expect(songs.find((s) => s.title === "Airbag")!.artist).toBe("Radiohead");
  });

  it("labels encores and keeps info", () => {
    expect(songs[0].setName).toBeUndefined();
    expect(songs[2].setName).toBe("Encore");
    expect(songs[4].setName).toBe("Encore 2");
    expect(songs[1].info).toBe("Extended outro");
  });

  it("handles setlists without sets", () => {
    expect(flattenSongs({ ...sample, sets: undefined })).toEqual([]);
  });
});

describe("isoDate", () => {
  it("converts dd-MM-yyyy", () => expect(isoDate("23-08-2025")).toBe("2025-08-23"));
});
