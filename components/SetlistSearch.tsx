"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { SetlistSummary } from "@/lib/setlistfm";

type SearchResult = { setlists: SetlistSummary[]; total: number; page: number; itemsPerPage: number };

export function SetlistSearch() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(artist: string, page: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/setlists/search?${new URLSearchParams({ artist, p: String(page) })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Search failed (${res.status})`);
      setResult(data);
      setSearched(artist);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const artist = query.trim();
    if (artist) load(artist, 1);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.itemsPerPage)) : 1;

  return (
    <>
      <form onSubmit={onSubmit} className="card row">
        <input
          type="search"
          className="grow"
          placeholder="Artist name, e.g. Radiohead"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Artist name"
          autoFocus
        />
        <button type="submit" className="primary" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <div className="banner error">{error}</div>}

      {result && (
        <div className="card">
          {result.setlists.length === 0 ? (
            <p className="muted">No setlists found for “{searched}”.</p>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                {result.total.toLocaleString()} setlists for “{searched}”. Empty setlists are greyed out.
              </p>
              <ul className="results">
                {result.setlists.map((s) => (
                  <li key={s.id} style={s.songCount === 0 ? { opacity: 0.5 } : undefined}>
                    <Link href={`/setlist/${s.id}`}>
                      <span className="date">{s.date}</span>
                      <span className="grow">
                        <strong>{s.artist}</strong> at {s.venue}
                        <span className="muted">
                          {" "}
                          · {[s.city, s.country].filter(Boolean).join(", ")}
                          {s.tour ? ` · ${s.tour}` : ""}
                        </span>
                      </span>
                      <span className="muted small">{s.songCount} songs</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {totalPages > 1 && (
                <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
                  <button disabled={loading || result.page <= 1} onClick={() => load(searched, result.page - 1)}>
                    ← Newer
                  </button>
                  <span className="muted small">
                    Page {result.page} of {totalPages}
                  </span>
                  <button disabled={loading || result.page >= totalPages} onClick={() => load(searched, result.page + 1)}>
                    Older →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
