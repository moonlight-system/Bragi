import "./Cover.css";
import { useEffect, useState } from "react";
import { Music } from "lucide-react";
import { readFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getBragiDir } from "../storage";

const urlCache = new Map<string, string>();   // cover file name -> blob URL, so rows don't re-read the file

// loads covers/<file> and returns a blob URL (null while loading, or if there is no cover)
function useCoverUrl(file?: string): string | null {
  const [url, setUrl] = useState<string | null>(file ? urlCache.get(file) ?? null : null);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const cached = urlCache.get(file);
    if (cached) { setUrl(cached); return; }

    let cancelled = false;
    (async () => {
      try {
        const bytes = await readFile(await join(await getBragiDir(), "covers", file));
        const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        urlCache.set(file, objectUrl);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        // missing file: the music note placeholder stays
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  return url;
}

// a square showing `url` as a background, or a music note when there is none
function CoverBox({ url, className = "" }: { url?: string | null; className?: string }) {
  return (
    <div
      className={`cover_box ${className}`}
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
    >
      {!url && <Music className="cover_icon" />}
    </div>
  );
}

// same, for a song: `file` is Song.cover
function SongCover({ file, className }: { file?: string; className?: string }) {
  const url = useCoverUrl(file);
  return <CoverBox url={url} className={className} />;
}

export { CoverBox, SongCover };