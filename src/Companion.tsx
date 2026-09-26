import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoUrl from "../logo.png";
import {
  REMOTE_CATALOG_URL,
  installRemotePack,
  parseRemotePacks,
} from "./remote";
import "./companion.css";

type CompanionProps = { packId: string };
type CompanionState = "applying" | "downloading" | "applied" | "failed";

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function Companion({ packId }: CompanionProps) {
  const [state, setState] = useState<CompanionState>("applying");
  const [progress, setProgress] = useState(0);
  const [closing, setClosing] = useState(false);

  async function closeAfter(milliseconds: number) {
    await wait(milliseconds);
    setClosing(true);
    await wait(420);
    await getCurrentWindow().destroy();
  }

  useEffect(() => {
    void (async () => {
      const catalog = await invoke<{ packs: { id: string }[] }>("list_cursor_packs");
      if (!catalog.packs.some((pack) => pack.id === packId)) {
        setState("downloading");
        const response = await fetch(`${REMOTE_CATALOG_URL}?pack=${encodeURIComponent(packId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Cursor pack unavailable.");
        const remotePack = parseRemotePacks({ packs: [await response.json()] })[0];
        if (!remotePack || remotePack.id !== packId) throw new Error("Cursor pack unavailable.");
        await installRemotePack(remotePack, setProgress);
      }
      setState("applying");
      await invoke("apply_cursor_pack", { packId });
      setState("applied");
      await closeAfter(1_200);
    })().catch(async () => {
      setState("failed");
      await closeAfter(2_000);
    });
  }, [packId]);

  const label = state === "downloading"
    ? `Downloading ${Math.round(progress * 100)}%`
    : state === "applied"
      ? "Applied"
      : state === "failed"
        ? "Could not apply cursor"
        : "Applying";

  return (
    <main className={`companion-viewport is-${state}${closing ? " is-closing" : ""}`}>
      <section className="companion-window" role="status" aria-live="polite">
        <img className="companion-logo" src={logoUrl} alt="" />
        <div className="companion-copy">
          <strong>Applying cursor</strong>
          <span>{label}</span>
        </div>
        <div className="companion-progress" aria-hidden="true">
          <i style={state === "downloading" ? { width: `${progress * 100}%` } : undefined} />
        </div>
      </section>
    </main>
  );
}
