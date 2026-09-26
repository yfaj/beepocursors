import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent } from "@tauri-apps/plugin-deep-link";
import { companionPackId } from "./remote";

async function start() {
  const root = createRoot(document.getElementById("root")!);
  const packId = await getCurrent().then(companionPackId).catch(() => null);
  if (packId) {
    const { default: Companion } = await import("./Companion");
    flushSync(() => root.render(<Companion packId={packId} />));
  } else {
    const { default: App } = await import("./App");
    flushSync(() => root.render(<StrictMode><App /></StrictMode>));
  }
  await getCurrentWindow().show().catch(() => {});
}

void start();
