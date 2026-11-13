import { SetlistSearch } from "@/components/SetlistSearch";

export default function Home() {
  return (
    <>
      <h1>Setlist → playlist</h1>
      <p className="muted">Find a concert on setlist.fm and turn it into a Spotify or Deezer playlist.</p>
      <SetlistSearch />
    </>
  );
}
