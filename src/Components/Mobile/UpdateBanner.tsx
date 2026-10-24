import { useEffect, useRef, useState } from "react";

const REPO = "moonlight-system/Bragi";

// "v1.0.10" vs "1.0.9": compares major, minor, patch as numbers
function isNewer(latest: string, current: string) {
  const a = latest.replace(/^v/, "").split(".").map(Number);
  const b = current.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function UpdateBanner() {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  // once, on startup: ask GitHub for the latest published release
  useEffect(() => {
    const native = window.BragiNative;
    if (!native?.appVersion) return;
    (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        if (!res.ok) return;
        const release = await res.json();
        const asset = release.assets?.find((a: any) => a.name.endsWith("-android.apk"));
        if (asset && isNewer(release.tag_name, native.appVersion!())) {
          setUpdate({ version: release.tag_name, url: asset.browser_download_url });
        }
      } catch {
        // offline or rate-limited: just skip the check
      }
    })();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  function start() {
    const native = window.BragiNative!;
    if (!native.canInstall?.()) {
      native.askInstallPermission?.();
      setStatus("Allow Bragi to install apps in the settings that just opened, then come back and tap Update again.");
      return;
    }
    setBusy(true);
    setStatus("Downloading… 0%");
    native.downloadUpdate?.(update!.url);
    if (timer.current) clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      const s = native.updateStatus?.() ?? "";
      if (s.startsWith("downloading")) {
        setStatus(`Downloading… ${s.split(":")[1]}%`);
      } else if (s === "installing") {
        setStatus("Opening the installer…");
        setBusy(false);
        clearInterval(timer.current!);
      } else if (s.startsWith("error")) {
        setStatus("Update failed: " + s.slice(6));
        setBusy(false);
        clearInterval(timer.current!);
      }
    }, 500);
  }

  if (!update) return null;
  return (
    <div className="m_update">
      <div className="m_update_text">{status || `Update available: ${update.version}`}</div>
      <button className="app_button" onClick={start} disabled={busy}>Update</button>
    </div>
  );
}

export { UpdateBanner };