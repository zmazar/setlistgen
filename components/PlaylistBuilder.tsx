"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ProviderId, TrackMatch } from "@/lib/providers/types";
import type { SetlistSummary, Song } from "@/lib/setlistfm";

type ProviderStatus = { id: ProviderId; name: string; configured: boolean; connected: boolean };
type MatchResult = { match: TrackMatch | null; error?: string };
type Cell = { status: "loading" } | { status: "done"; match: TrackMatch | null; error?: string };

type Row = {
  key: number;
  song: Song;
  artist: string;
  title: string;
  included: boolean;
  editing: boolean;
  cells: Partial<Record<ProviderId, Cell>>;
};

type Created = { url: string; added: number } | { error: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data as T;
}

export function PlaylistBuilder({ summary, songs }: { summary: SetlistSummary; songs: Song[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<Row[]>(() =>
    songs.map((song, key) => ({ key, song, artist: song.artist, title: song.title, included: true, editing: false, cells: {} })),
  );
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [banner, setBanner] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [name, setName] = useState(() =>
    [`${summary.artist} @ ${summary.venue}`, summary.city].filter(Boolean).join(", ") + ` (${summary.date})`,
  );
  const [creating, setCreating] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [created, setCreated] = useState<Partial<Record<ProviderId, Created>>>({});
  const autoMatched = useRef(new Set<ProviderId>());

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load connection status");
      setProviders(data.providers);
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  // Surface the result of an OAuth round-trip, then clean the URL.
  useEffect(() => {
    const authError = searchParams.get("authError");
    const connected = searchParams.get("connected");
    if (authError) setBanner({ kind: "error", text: authError });
    else if (connected) setBanner({ kind: "ok", text: `Connected to ${connected === "deezer" ? "Deezer" : "Spotify"}.` });
    if (authError || connected) router.replace(pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const matchRows = useCallback(
    async (provider: ProviderId, targets: { key: number; artist: string; title: string }[]) => {
      if (targets.length === 0) return;
      const keys = new Set(targets.map((t) => t.key));
      const setCells = (fn: (row: Row, i: number) => Cell) =>
        setRows((prev) => {
          let i = 0;
          return prev.map((row) => (keys.has(row.key) ? { ...row, cells: { ...row.cells, [provider]: fn(row, i++) } } : row));
        });

      setCells(() => ({ status: "loading" }));
      try {
        const { results } = await postJson<{ results: MatchResult[] }>("/api/match", {
          provider,
          songs: targets.map(({ artist, title }) => ({ artist, title })),
        });
        setCells((_row, i) => ({ status: "done", match: results[i]?.match ?? null, error: results[i]?.error }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setCells(() => ({ status: "done", match: null, error: message }));
        setBanner({ kind: "error", text: message });
        if ((e as { status?: number }).status === 401) loadStatus();
      }
    },
    [loadStatus],
  );

  // Match the whole setlist automatically for each connected provider, once.
  useEffect(() => {
    for (const p of providers ?? []) {
      if (p.connected && !autoMatched.current.has(p.id)) {
        autoMatched.current.add(p.id);
        matchRows(p.id, rows.map(({ key, artist, title }) => ({ key, artist, title })));
      }
    }
    // Only re-run when connection status changes, not on every row edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, matchRows]);

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const connected = (providers ?? []).filter((p) => p.connected);
  const configured = (providers ?? []).filter((p) => p.configured);
  const unconfigured = (providers ?? []).filter((p) => !p.configured);

  function researchRow(row: Row) {
    updateRow(row.key, { editing: false });
    for (const p of connected) matchRows(p.id, [{ key: row.key, artist: row.artist.trim(), title: row.title.trim() }]);
  }

  function trackIdsFor(provider: ProviderId): string[] {
    const ids: string[] = [];
    for (const row of rows) {
      const cell = row.cells[provider];
      if (row.included && cell?.status === "done" && cell.match && !ids.includes(cell.match.id)) ids.push(cell.match.id);
    }
    return ids;
  }

  async function createPlaylist(provider: ProviderId) {
    setCreating((c) => ({ ...c, [provider]: true }));
    setCreated((c) => ({ ...c, [provider]: undefined }));
    try {
      const data = await postJson<{ url: string; added: number }>("/api/playlist", {
        provider,
        name: name.trim(),
        description: `Setlist: ${summary.artist} at ${summary.venue}, ${summary.city} on ${summary.date}. Generated from setlist.fm.`,
        trackIds: trackIdsFor(provider),
      });
      setCreated((c) => ({ ...c, [provider]: data }));
    } catch (e) {
      setCreated((c) => ({ ...c, [provider]: { error: e instanceof Error ? e.message : String(e) } }));
      if ((e as { status?: number }).status === 401) loadStatus();
    } finally {
      setCreating((c) => ({ ...c, [provider]: false }));
    }
  }

  async function disconnect(provider: ProviderId) {
    await fetch(`/api/auth/${provider}/logout`, { method: "POST" });
    autoMatched.current.delete(provider);
    setRows((prev) =>
      prev.map((r) => {
        const cells = { ...r.cells };
        delete cells[provider];
        return { ...r, cells };
      }),
    );
    loadStatus();
  }

  const loginHref = (id: ProviderId) => `/api/auth/${id}/login?${new URLSearchParams({ returnTo: pathname })}`;
  const includedCount = rows.filter((r) => r.included).length;

  return (
    <>
      <h1>
        {summary.artist} <span className="muted">at</span> {summary.venue}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {summary.date} · {[summary.city, summary.country].filter(Boolean).join(", ")}
        {summary.tour ? ` · ${summary.tour}` : ""}
        {summary.url && (
          <>
            {" · "}
            <a href={summary.url} target="_blank" rel="noreferrer">
              setlist.fm
            </a>
          </>
        )}
      </p>

      {banner && (
        <div className={`banner ${banner.kind === "error" ? "error" : ""}`}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className={banner.kind === "ok" ? "ok" : undefined}>{banner.text}</span>
            <button className="link-button" onClick={() => setBanner(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {songs.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            This setlist has no songs yet. Try another show.
          </p>
        </div>
      ) : (
        <>
          <section className="card">
            <h2>Services</h2>
            {providers === null ? (
              <p className="muted">Checking connections…</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {configured.map((p) => (
                  <div key={p.id} className="row">
                    <span className="grow">
                      <span className={`provider-badge ${p.id}`} />
                      <strong>{p.name}</strong>{" "}
                      <span className="muted small">{p.connected ? "connected" : "not connected"}</span>
                    </span>
                    {p.connected ? (
                      <>
                        <button
                          className="primary"
                          disabled={creating[p.id] || !name.trim() || trackIdsFor(p.id).length === 0}
                          onClick={() => createPlaylist(p.id)}
                        >
                          {creating[p.id] ? "Creating…" : `Create ${p.name} playlist (${trackIdsFor(p.id).length})`}
                        </button>
                        <button onClick={() => disconnect(p.id)}>Disconnect</button>
                      </>
                    ) : (
                      <a className="button primary" href={loginHref(p.id)}>
                        Connect {p.name}
                      </a>
                    )}
                    {(() => {
                      const result = created[p.id];
                      if (!result) return null;
                      return (
                        <div style={{ flexBasis: "100%" }} className="small">
                          {"error" in result ? (
                            <span className="error">{result.error}</span>
                          ) : (
                            <span className="ok">
                              Created with {result.added} tracks:{" "}
                              <a href={result.url} target="_blank" rel="noreferrer">
                                open in {p.name}
                              </a>
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
                {unconfigured.map((p) => (
                  <div key={p.id} className="muted small">
                    <span className={`provider-badge ${p.id}`} style={{ opacity: 0.4 }} />
                    {p.name} isn’t configured. Add its credentials to .env.local to enable it.
                  </div>
                ))}
              </div>
            )}

            <label className="small muted" htmlFor="playlist-name" style={{ display: "block", marginTop: 16 }}>
              Playlist name
            </label>
            <input id="playlist-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </section>

          <section className="card">
            <h2>
              Songs <span className="muted small">({includedCount} of {rows.length} included)</span>
            </h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>#</th>
                    <th>Song</th>
                    {connected.map((p) => (
                      <th key={p.id}>
                        <span className={`provider-badge ${p.id}`} />
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const showHeading = row.song.setName && row.song.setName !== rows[i - 1]?.song.setName;
                    return (
                      <Fragment key={row.key}>
                        {showHeading && (
                          <tr className="set-heading">
                            <td colSpan={3 + connected.length}>{row.song.setName}</td>
                          </tr>
                        )}
                        <tr className={row.included ? undefined : "excluded"}>
                          <td>
                            <input
                              type="checkbox"
                              checked={row.included}
                              onChange={(e) => updateRow(row.key, { included: e.target.checked })}
                              aria-label={`Include ${row.song.title}`}
                            />
                          </td>
                          <td className="num">{i + 1}</td>
                          <td>
                            <strong>{row.title}</strong>
                            {(row.song.isCover || row.artist !== summary.artist) && (
                              <span className="muted"> ({row.song.isCover ? `${row.artist} cover` : row.artist})</span>
                            )}
                            {row.song.info && <div className="muted small">{row.song.info}</div>}
                            {connected.length > 0 &&
                              (row.editing ? (
                                <div className="edit-row">
                                  <input
                                    type="text"
                                    value={row.title}
                                    onChange={(e) => updateRow(row.key, { title: e.target.value })}
                                    aria-label="Title"
                                  />
                                  <input
                                    type="text"
                                    value={row.artist}
                                    onChange={(e) => updateRow(row.key, { artist: e.target.value })}
                                    aria-label="Artist"
                                  />
                                  <button
                                    className="primary"
                                    disabled={!row.title.trim() || !row.artist.trim()}
                                    onClick={() => researchRow(row)}
                                  >
                                    Search
                                  </button>
                                  <button onClick={() => updateRow(row.key, { editing: false })}>Cancel</button>
                                </div>
                              ) : (
                                <div>
                                  <button className="link-button" onClick={() => updateRow(row.key, { editing: true })}>
                                    Edit search
                                  </button>
                                </div>
                              ))}
                          </td>
                          {connected.map((p) => (
                            <td key={p.id} className="match">
                              <MatchCell cell={row.cells[p.id]} />
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {connected.length === 0 && providers !== null && (
              <p className="muted small">Connect a service above to match these songs.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function MatchCell({ cell }: { cell: Cell | undefined }) {
  if (!cell) return <span className="muted">–</span>;
  if (cell.status === "loading") return <span className="muted">Searching…</span>;
  if (!cell.match) {
    return (
      <span className={cell.error ? "error" : "warn"} title={cell.error} style={{ color: cell.error ? undefined : "var(--warn)" }}>
        ✗ {cell.error ? "Error" : "Not found"}
      </span>
    );
  }
  const m = cell.match;
  return (
    <span title={`Match score ${Math.round(m.score * 100)}%`}>
      <span className="title">
        <span className="ok">✓</span>{" "}
        {m.url ? (
          <a href={m.url} target="_blank" rel="noreferrer">
            {m.title}
          </a>
        ) : (
          m.title
        )}
      </span>
      <span className="muted small">
        {m.artists.join(", ")}
        {m.album ? ` · ${m.album}` : ""}
      </span>
    </span>
  );
}
