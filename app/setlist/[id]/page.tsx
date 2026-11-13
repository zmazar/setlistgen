import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlaylistBuilder } from "@/components/PlaylistBuilder";
import { HttpError } from "@/lib/http";
import { getSetlist } from "@/lib/setlistfm";

export default function SetlistPage({ params }: PageProps<"/setlist/[id]">) {
  return (
    <Suspense fallback={<p className="muted">Loading setlist…</p>}>
      <SetlistLoader params={params} />
    </Suspense>
  );
}

async function SetlistLoader({ params }: { params: PageProps<"/setlist/[id]">["params"] }) {
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getSetlist>>;
  try {
    data = await getSetlist(id);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  return <PlaylistBuilder summary={data.summary} songs={data.songs} />;
}
