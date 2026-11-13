"use client";

import Link from "next/link";

export default function SetlistError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="banner error">
      <p style={{ marginTop: 0 }}>Couldn’t load this setlist: {error.message}</p>
      <div className="row">
        <button onClick={() => retry()}>Try again</button>
        <Link href="/" className="button">
          Back to search
        </Link>
      </div>
    </div>
  );
}
