import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-dialog";
import logoUrl from "../logo.png";
import {
  REMOTE_CATALOG_URL,
  companionPackId,
  installRemotePack,
  parseRemotePackDetail,
  parseRemotePacks,
  roleOrder,
  type CursorRole,
  type PackRole,
  type RemotePack,
} from "./remote";
import "./styles.css";

const menuItems = ["Browse", "Settings"] as const;
type MenuItem = (typeof menuItems)[number];

const MIN_STARTUP_MS = 2_000;
const RESIZE_MS = 500;
const CLOSE_MS = 500;
const CONTENT_FADE_MS = 300;
const CONTENT_SWAP_MS = 180;
const APPLY_FEEDBACK_MS = 1_200;
const DRAG_INTERPOLATION_MS = 45;
const DRAG_PREDICTION_MS = 24;
const DRAG_MAX_LEAD = 10;

type CursorPack = {
  id: string;
  name: string;
  folder: string;
  author: string;
  authorUrl: string;
  license?: string;
  fingerprint?: string;
  family?: string;
  variant?: string;
  installed?: boolean;
  remote?: boolean;
  downloadable?: boolean;
  manifestHash?: string;
  packageUrl?: string;
  packageSha256?: string;
  packageBytes?: number;
  preview: string;
  roles: Partial<Record<CursorRole, PackRole>>;
};

const roleLabels: Record<CursorRole, string> = {
  arrow: "Normal Select",
  help: "Help Select",
  workingInBackground: "Working",
  busy: "Busy",
  precisionSelect: "Precision Select",
  textSelect: "Text Select",
  handwriting: "Handwriting",
  unavailable: "Unavailable",
  verticalResize: "Vertical Resize",
  horizontalResize: "Horizontal Resize",
  diagonalResize1: "Diagonal Resize 1",
  diagonalResize2: "Diagonal Resize 2",
  move: "Move",
  alternateSelect: "Alternate Select",
  linkSelect: "Link Select",
  personSelect: "Person Select",
  locationSelect: "Location Select",
};

const themeSuffix = /\s+((?:(?:dark|light)\s+)?(?:blue|green|orange|purple|red|cyan|magenta|cerise|white|black)|dark|light)$/i;

function nameParts(name: string) {
  const bracketed = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (bracketed) return { base: bracketed[1].trim(), theme: bracketed[2].trim() };
  const suffixed = name.match(themeSuffix);
  return suffixed
    ? { base: name.slice(0, suffixed.index).trim(), theme: suffixed[1].trim() }
    : { base: name.trim(), theme: "" };
}

function familyName(pack: CursorPack) {
  if (pack.family) return pack.family;
  const root = pack.roles.arrow?.file.replaceAll("\\", "/").split("/")[0] ?? "";
  if (/\s+cursors?$/i.test(root)) return root.replace(/\s+cursors?$/i, "").trim();
  return nameParts(pack.name).base;
}

function variantLabel(pack: CursorPack) {
  if (pack.variant) return pack.variant;
  const family = familyName(pack);
  const { base, theme } = nameParts(pack.name);
  const path = pack.roles.arrow?.file.replaceAll("\\", "/").split("/") ?? [];
  const alt = path.findIndex((part) => part.toLowerCase() === "_alt");
  const pathStyle = alt >= 0 ? path[alt + 1] : "";
  const nameStyle = base.toLowerCase().startsWith(family.toLowerCase())
    ? base.slice(family.length).trim()
    : "";
  const style = pathStyle || nameStyle;
  const parts = [style && style.toLowerCase() !== theme.toLowerCase() ? style : "", theme]
    .filter(Boolean);
  return parts.join(" · ") || "Default";
}

function familyVariants(items: CursorPack[]) {
  const variants = items
    .map((pack) => ({ pack, label: variantLabel(pack) }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.pack.id.localeCompare(right.pack.id));
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const variant of variants) totals.set(variant.label, (totals.get(variant.label) ?? 0) + 1);
  return variants.map((variant) => {
    const number = (seen.get(variant.label) ?? 0) + 1;
    seen.set(variant.label, number);
    return {
      ...variant,
      label: (totals.get(variant.label) ?? 0) > 1 ? `${variant.label} #${number}` : variant.label,
    };
  });
}

function packFamilies(items: CursorPack[]) {
  const grouped = new Map<string, CursorPack[]>();
  for (const pack of items) {
    const family = familyName(pack);
    grouped.set(family, [...(grouped.get(family) ?? []), pack]);
  }
  return [...grouped].map(([name, familyPacks]) => ({
    name,
    variants: familyVariants(familyPacks),
  })).sort((left, right) => left.name.localeCompare(right.name));
}

function remoteCursorPack(pack: RemotePack): CursorPack {
  const arrow: PackRole = { file: "", preview: pack.preview, hover: "", hotspot: [0, 0] };
  return {
    ...pack,
    folder: "",
    preview: pack.preview,
    remote: true,
    installed: false,
    roles: pack.roles ?? {
      arrow,
      linkSelect: { ...arrow, preview: pack.linkPreview },
    },
  };
}

function mergeCatalogPacks(localPacks: CursorPack[], remotePacks: RemotePack[]) {
  const installedFingerprints = new Set(localPacks.map((pack) => pack.fingerprint).filter(Boolean));
  const localIds = new Set(localPacks.map((pack) => pack.id));
  return [
    ...localPacks.map((pack) => ({ ...pack, installed: true, remote: false })),
    ...remotePacks
      .filter((pack) => !installedFingerprints.has(pack.fingerprint) && !localIds.has(pack.id))
      .map(remoteCursorPack),
  ];
}

function PackOpenButton({
  pack,
  onSelect,
  alt,
  children,
}: {
  pack: CursorPack;
  onSelect: (packId: string) => void;
  alt: string;
  children: ReactNode;
}) {
  const [previewHovered, setPreviewHovered] = useState(false);
  const [showLinkPreview, setShowLinkPreview] = useState(false);
  useEffect(() => {
    if (!previewHovered) return;
    const timer = window.setTimeout(() => setShowLinkPreview(true), 300);
    return () => window.clearTimeout(timer);
  }, [previewHovered]);
  const linkPreview = pack.roles.linkSelect?.preview ?? pack.preview;
  const thumbnailClass = `pack-thumbnail${previewHovered ? showLinkPreview ? " is-link-preview" : " is-switching" : ""}`;

  return (
    <button
      className="pack-open"
      type="button"
      onClick={() => onSelect(pack.id)}
      onMouseEnter={() => setPreviewHovered(true)}
      onMouseLeave={() => {
        setShowLinkPreview(false);
        setPreviewHovered(false);
      }}
    >
      <div className={thumbnailClass}>
        <img className="pack-normal-preview" src={pack.preview} alt={alt} />
        <img className="pack-link-preview" src={linkPreview} alt="" />
      </div>
      {pack.installed && <span className="installed-marker" role="img" aria-label="Installed">✓</span>}
      {children}
    </button>
  );
}

function FamilyGrid({ items, onSelect }: { items: CursorPack[]; onSelect: (packId: string) => void }) {
  return (
    <div className="pack-list">
      {packFamilies(items).map((family) => {
        const first = family.variants[0].pack;
        return (
          <article className="pack-card" key={family.name}>
            <PackOpenButton pack={first} onSelect={onSelect} alt={`${family.name} cursor preview`}>
              <strong>{family.name}</strong>
              <span className="variant-count">{family.variants.length} {family.variants.length === 1 ? "pack" : "variants"}</span>
            </PackOpenButton>
          </article>
        );
      })}
    </div>
  );
}

function PackGrid({
  items,
  onSelect,
  onCreator,
}: {
  items: CursorPack[];
  onSelect: (packId: string) => void;
  onCreator: (event: MouseEvent<HTMLAnchorElement>, pack: CursorPack) => void;
}) {
  return (
    <div className="pack-list">
      {items.map((pack) => (
        <article className="pack-card" key={pack.id}>
          <PackOpenButton pack={pack} onSelect={onSelect} alt={`${pack.name} arrow cursor preview`}>
            <strong>{pack.name}</strong>
          </PackOpenButton>
          {pack.authorUrl ? (
            <a
              href={pack.authorUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => onCreator(event, pack)}
            >
              by {pack.author}
            </a>
          ) : <span className="pack-author">by {pack.author}</span>}
        </article>
      ))}
    </div>
  );
}

const appWindow = getCurrentWindow();

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function nextPaint() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function setSmoothWindowPosition(x: number, y: number) {
  return invoke<void>("set_smooth_window_position", {
    x: Math.round(x),
    y: Math.round(y),
  });
}

type SmoothDrag = {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startWindowX: number;
  startWindowY: number;
  scaleFactor: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  lastMoveAt: number;
  lastFrameAt: number;
  frame: number | null;
  pending: Promise<void> | null;
  active: boolean;
};

let dragGeneration = 0;
let dragPointerId: number | null = null;
let dragFinishing = false;
let smoothDrag: SmoothDrag | null = null;

function scheduleSmoothDrag(drag: SmoothDrag) {
  drag.frame = window.requestAnimationFrame(() => {
    if (smoothDrag !== drag || !drag.active) return;
    const now = performance.now();
    const idle = now - drag.lastMoveAt;
    const frameElapsed = Math.min(now - drag.lastFrameAt, 50);
    drag.lastFrameAt = now;
    const response = 1 - Math.exp(-frameElapsed / DRAG_INTERPOLATION_MS);
    const predictionDecay = Math.max(0, 1 - idle / 80);
    const leadX = drag.velocityX * DRAG_PREDICTION_MS * predictionDecay;
    const leadY = drag.velocityY * DRAG_PREDICTION_MS * predictionDecay;
    const leadLength = Math.hypot(leadX, leadY);
    const leadScale = leadLength > DRAG_MAX_LEAD
      ? DRAG_MAX_LEAD / leadLength
      : 1;
    const predictedX = drag.targetX + leadX * leadScale;
    const predictedY = drag.targetY + leadY * leadScale;
    drag.currentX += (predictedX - drag.currentX) * response;
    drag.currentY += (predictedY - drag.currentY) * response;
    drag.pending = setSmoothWindowPosition(drag.currentX, drag.currentY).catch(() => {});
    void drag.pending.finally(() => {
      if (smoothDrag === drag && drag.active) scheduleSmoothDrag(drag);
    });
  });
}

async function startSmoothDrag(event: ReactPointerEvent<HTMLElement>) {
  if (event.button !== 0 || (event.target as Element).closest("button")) return;
  if (dragPointerId !== null) return;
  dragPointerId = event.pointerId;
  dragFinishing = false;
  const generation = ++dragGeneration;

  try {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("dragging");
    const [position, scaleFactor] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.scaleFactor(),
    ]);
    if (generation !== dragGeneration) return;
    const now = performance.now();
    smoothDrag = {
      pointerId: event.pointerId,
      startPointerX: event.screenX * scaleFactor,
      startPointerY: event.screenY * scaleFactor,
      startWindowX: position.x,
      startWindowY: position.y,
      scaleFactor,
      currentX: position.x,
      currentY: position.y,
      targetX: position.x,
      targetY: position.y,
      velocityX: 0,
      velocityY: 0,
      lastMoveAt: now,
      lastFrameAt: now,
      frame: null,
      pending: null,
      active: true,
    };
    scheduleSmoothDrag(smoothDrag);
  } catch {
    if (generation === dragGeneration) {
      document.documentElement.classList.remove("dragging");
    }
    if (dragPointerId === event.pointerId) dragPointerId = null;
    dragFinishing = false;
  }
}

function moveSmoothDrag(event: ReactPointerEvent<HTMLElement>) {
  const drag = smoothDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const nextX = drag.startWindowX
    + event.screenX * drag.scaleFactor
    - drag.startPointerX;
  const nextY = drag.startWindowY
    + event.screenY * drag.scaleFactor
    - drag.startPointerY;
  const now = performance.now();
  const elapsed = Math.max(now - drag.lastMoveAt, 1);
  drag.velocityX = drag.velocityX * .5 + ((nextX - drag.targetX) / elapsed) * .5;
  drag.velocityY = drag.velocityY * .5 + ((nextY - drag.targetY) / elapsed) * .5;
  drag.targetX = nextX;
  drag.targetY = nextY;
  drag.lastMoveAt = now;
}

async function endSmoothDrag(pointerId: number) {
  if (pointerId !== dragPointerId || dragFinishing) return;
  dragFinishing = true;
  dragGeneration += 1;
  document.documentElement.classList.remove("dragging");
  const drag = smoothDrag;
  if (!drag) {
    dragPointerId = null;
    dragFinishing = false;
    return;
  }
  smoothDrag = null;
  drag.active = false;
  if (drag.frame !== null) window.cancelAnimationFrame(drag.frame);
  await drag.pending?.catch(() => {});
  await setSmoothWindowPosition(drag.targetX, drag.targetY).catch(() => {});
  if (dragPointerId === pointerId) dragPointerId = null;
  dragFinishing = false;
}

export default function App() {
  const [localPacks, setLocalPacks] = useState<CursorPack[]>([]);
  const [remotePacks, setRemotePacks] = useState<RemotePack[]>([]);
  const [remoteStatus, setRemoteStatus] = useState("Checking…");
  const [startupStage, setStartupStage] = useState("Loading cursor catalog…");
  const [startupExpanding, setStartupExpanding] = useState(false);
  const [startupLeaving, setStartupLeaving] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [protocolRequest, setProtocolRequest] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [showGoodbye, setShowGoodbye] = useState(false);
  const closeStarted = useRef(false);
  const closeAllowed = useRef(false);
  const [activeItem, setActiveItem] = useState<MenuItem>("Browse");
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [contentLeaving, setContentLeaving] = useState(false);
  const contentTransitioning = useRef(false);
  const [status, setStatus] = useState("");
  const [applyState, setApplyState] = useState<"idle" | "downloading" | "applying" | "applied">("idle");
  const [applyProgress, setApplyProgress] = useState(0);
  const [browseSearchOpen, setBrowseSearchOpen] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const browseSearchInput = useRef<HTMLInputElement>(null);
  const [hoverPreview, setHoverPreview] = useState<{
    url: string;
    left: number;
    top: number;
  } | null>(null);
  const packs = mergeCatalogPacks(localPacks, remotePacks);
  const selectedPack = packs.find((pack) => pack.id === selectedPackId);
  const selectedFamily = selectedPack
    ? familyVariants(packs.filter((pack) => familyName(pack) === familyName(selectedPack)))
    : [];
  const featuredPacks = packs.filter((pack) => pack.author === "Beepo Cursors");
  const browseSearchQuery = browseSearch.trim().toLocaleLowerCase();
  const visiblePacks = browseSearchQuery
    ? packs.filter((pack) => [pack.name, pack.author, familyName(pack), variantLabel(pack)]
      .some((value) => value.toLocaleLowerCase().includes(browseSearchQuery)))
    : packs;

  const beginClose = useCallback(async () => {
    if (closeStarted.current) return;
    closeStarted.current = true;
    setClosing(true);
    await wait(CONTENT_FADE_MS);
    setShowGoodbye(true);
    await wait(CLOSE_MS);
    await appWindow.destroy();
  }, []);

  useEffect(() => {
    let unlisten = () => {};
    let disposed = false;
    void appWindow.onCloseRequested((event) => {
      if (closeAllowed.current) return;
      event.preventDefault();
      void beginClose();
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      disposed = true;
      unlisten();
    };
  }, [beginClose]);

  useEffect(() => {
    let disposed = false;
    let unlisten = () => {};

    void onOpenUrl((urls) => {
      const packId = companionPackId(urls);
      if (packId) setProtocolRequest(packId);
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch(() => {});

    return () => {
      disposed = true;
      unlisten();
    };
  }, []);

  useEffect(() => {
    if (!browseSearchOpen) return;
    const frame = window.requestAnimationFrame(() => browseSearchInput.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [browseSearchOpen]);

  useEffect(() => {
    let active = true;
    const minimumDelay = wait(MIN_STARTUP_MS);
    const catalogReady = (async () => {
      await nextPaint();
      if (!active) return;
      setStartupStage("Checking installed cursors…");
      await nextPaint();
      try {
        const catalog = await invoke<{ packs: CursorPack[] }>("list_cursor_packs");
        if (!active) return;
        setLocalPacks(catalog.packs);
        await wait(120);
      } catch {
        if (!active) return;
        await wait(120);
      }
    })();

    void Promise.all([catalogReady, minimumDelay]).then(async () => {
      if (!active) return;
      setStartupStage("Ready");
      await wait(120);
      setStartupExpanding(true);
      await wait(RESIZE_MS);
      await appWindow.setAlwaysOnTop(false).catch(() => {});
      setStartupLeaving(true);
      await wait(CONTENT_FADE_MS);
      if (!active) return;
      setAppReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const refreshRemoteCatalog = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6_000);
    setRemoteStatus("Checking…");
    try {
      const response = await fetch(REMOTE_CATALOG_URL, { signal: controller.signal });
      if (!response.ok) throw new Error("Remote catalog unavailable");
      setRemotePacks(parseRemotePacks(await response.json()));
      setRemoteStatus("Online");
    } catch {
      setRemotePacks([]);
      setRemoteStatus("Offline — local library only");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (appReady) void refreshRemoteCatalog();
  }, [appReady, refreshRemoteCatalog]);

  useEffect(() => {
    const pack = remotePacks.find((candidate) => candidate.id === selectedPackId);
    if (!pack || pack.roles) return;
    const controller = new AbortController();
    void fetch(`${REMOTE_CATALOG_URL}?pack=${encodeURIComponent(pack.id)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Cursor previews unavailable");
        return response.json();
      })
      .then((value) => {
        const detail = parseRemotePackDetail(value);
        if (detail) setRemotePacks((current) => current.map((candidate) => candidate.id === detail.id ? detail : candidate));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [remotePacks, selectedPackId]);

  async function changeCursorScheme(
    command: string,
    success: string,
    args: Record<string, string> = {},
  ) {
    setStatus("Working…");
    try {
      await invoke(command, args);
      setStatus(success);
      return true;
    } catch (error) {
      setStatus(String(error));
      return false;
    }
  }

  async function transitionContent(nextItem: MenuItem, packId: string | null) {
    if (contentTransitioning.current || (nextItem === activeItem && packId === selectedPackId)) return;
    contentTransitioning.current = true;
    setContentLeaving(true);
    await wait(CONTENT_SWAP_MS);
    setActiveItem(nextItem);
    setSelectedPackId(packId);
    setStatus("");
    setContentLeaving(false);
    contentTransitioning.current = false;
  }

  async function applySelectedPack() {
    if (!selectedPack || applyState === "applying" || applyState === "downloading") return;
    try {
      if (selectedPack.remote) {
        const remotePack = remotePacks.find((candidate) => candidate.id === selectedPack.id);
        if (!remotePack) throw new Error("That cursor pack is unavailable.");
        setApplyProgress(0);
        setApplyState("downloading");
        await installRemotePack(remotePack, setApplyProgress);
        const catalog = await invoke<{ packs: CursorPack[] }>("list_cursor_packs");
        setLocalPacks(catalog.packs);
      }
      setApplyState("applying");
      await invoke("apply_cursor_pack", { packId: selectedPack.id });
      setApplyState("applied");
      await wait(APPLY_FEEDBACK_MS);
      setApplyState("idle");
      setApplyProgress(0);
    } catch (error) {
      setApplyState("idle");
      setApplyProgress(0);
      setStatus(String(error));
    }
  }

  useEffect(() => {
    if (!appReady || !protocolRequest) return;
    if (remoteStatus === "Checking…") return;
    const packId = protocolRequest;
    setProtocolRequest(null);
    if (applyState === "applying" || applyState === "downloading") return;

    const localPack = localPacks.find((candidate) => candidate.id === packId);
    const remotePack = remotePacks.find((candidate) => candidate.id === packId);
    setApplyProgress(0);
    setApplyState(localPack ? "applying" : "downloading");
    setStartupStage(localPack ? "Applying" : "Downloading 0%");
    void (async () => {
      if (!localPack) {
        if (!remotePack) throw new Error("That cursor pack is unavailable.");
        await installRemotePack(remotePack, (progress) => {
          setApplyProgress(progress);
          setStartupStage(`Downloading ${Math.round(progress * 100)}%`);
        });
        const catalog = await invoke<{ packs: CursorPack[] }>("list_cursor_packs");
        setLocalPacks(catalog.packs);
        if (!catalog.packs.some((candidate) => candidate.id === packId)) {
          throw new Error("Downloaded cursor pack was not installed.");
        }
      }
      setApplyState("applying");
      setStartupStage("Applying");
      await invoke("apply_cursor_pack", { packId });
    })()
      .then(async () => {
        setApplyState("applied");
        setStartupStage("Applied");
        await wait(APPLY_FEEDBACK_MS);
        setApplyState("idle");
        setApplyProgress(0);
        setActiveItem("Browse");
        setSelectedPackId(packId);
        setStatus("");
      })
      .catch(async (error) => {
        setApplyState("idle");
        setApplyProgress(0);
        setStatus(String(error));
        setStartupStage("Could not apply cursor.");
      });
  }, [appReady, applyState, localPacks, protocolRequest, remotePacks, remoteStatus]);

  function openCreator(event: MouseEvent<HTMLAnchorElement>, pack: CursorPack) {
    if (pack.remote) return;
    event.preventDefault();
    void invoke("open_creator_profile", { packId: pack.id });
  }

  async function openLibrary() {
    try {
      await invoke("open_cursor_library");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function importFolder() {
    const path = await open({ directory: true, multiple: false, title: "Import cursor folder" });
    if (typeof path !== "string") return;
    setStatus("Importing…");
    try {
      const catalog = await invoke<{ packs: CursorPack[] }>("import_cursor_folder", { path });
      setLocalPacks(catalog.packs);
      setStatus("Imported");
    } catch (error) {
      setStatus(String(error));
    }
  }

  if (showGoodbye) {
    return (
      <div className="startup-viewport">
        <div className="window-shell shutdown-shell">
          <div className="startup-loader shutdown-loader" role="status" aria-live="polite">
            <div className="startup-brand shutdown-brand">
              <img src={logoUrl} alt="" />
              <strong>Cya!</strong>
            </div>
            <span className="startup-stage">Closing…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!appReady) {
    return (
      <div className="startup-viewport">
        <div className={`window-shell startup-shell${startupExpanding ? " startup-expand" : ""}${startupLeaving ? " startup-leaving" : ""}`}>
          <div className="startup-loader" role="status" aria-live="polite">
            <div className="startup-brand">
              <img src={logoUrl} alt="" />
              <strong>Beepo <span className="brand-accent">Cursors</span></strong>
            </div>
            <span className="startup-stage">{startupStage}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`window-shell app-enter${closing ? " app-closing" : ""}`}>
      <header
        className="titlebar"
        onPointerDown={startSmoothDrag}
        onPointerMove={moveSmoothDrag}
        onPointerUp={(event) => void endSmoothDrag(event.pointerId)}
        onPointerCancel={(event) => void endSmoothDrag(event.pointerId)}
        onLostPointerCapture={(event) => void endSmoothDrag(event.pointerId)}
      >
        <div className="window-brand">
          <img src={logoUrl} alt="" />
          <span>Beepo <span className="brand-accent">Cursors</span></span>
        </div>

        <button
          className="tabs-peek"
          type="button"
          aria-label="Show navigation"
        />

        <nav className="title-tabs" aria-label="Main menu">
          {menuItems.map((item) => (
            <button
              key={item}
              type="button"
              className={activeItem === item ? "active" : ""}
              aria-current={activeItem === item ? "page" : undefined}
              onClick={() => void transitionContent(item, null)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="window-controls">
          <button
            type="button"
            aria-label="Minimize window"
            onClick={() => void appWindow.minimize()}
          >
            <span aria-hidden="true">—</span>
          </button>
          <button
            className="close-button"
            type="button"
            aria-label="Close window"
            onClick={() => void beginClose()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div className="app-layout">
        <main className="page" tabIndex={-1}>
          <div
            key={`${activeItem}:${selectedPackId ?? "catalog"}`}
            className={`page-content${contentLeaving ? " is-leaving" : ""}`}
          >
          {selectedPack ? (
            <section className="pack-details">
              <header className="pack-details-header">
                <button className="back-button" type="button" onClick={() => void transitionContent(activeItem, null)}>
                  ← Back
                </button>
                <div className="pack-identity">
                  <h1>{selectedFamily.length > 1 ? familyName(selectedPack) : selectedPack.name}</h1>
                  {selectedPack.authorUrl ? (
                    <a
                      href={selectedPack.authorUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => openCreator(event, selectedPack)}
                    >
                      by {selectedPack.author}
                    </a>
                  ) : <span className="pack-author">by {selectedPack.author}</span>}
                </div>
                {selectedFamily.length > 1 && (
                  <select
                    aria-label="Cursor variant"
                    value={selectedPack.id}
                    onChange={(event) => void transitionContent(activeItem, event.target.value)}
                  >
                    {selectedFamily.map((variant) => (
                      <option value={variant.pack.id} key={variant.pack.id}>{variant.label}</option>
                    ))}
                  </select>
                )}
                <div className="pack-actions pack-header-actions">
                  <button
                    className={`primary-button apply-button ${applyState}`}
                    type="button"
                    disabled={applyState === "applying" || applyState === "downloading"}
                    onClick={() => void applySelectedPack()}
                    style={{ "--download-progress": `${Math.round(applyProgress * 100)}%` } as CSSProperties}
                  >
                    <span>{applyState === "downloading"
                      ? `Downloading ${Math.round(applyProgress * 100)}%`
                      : applyState === "applying" ? "Applying" : applyState === "applied" ? "Applied" : "Apply"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void changeCursorScheme("restore_windows_default_cursors", "Windows default restored")}
                  >
                    Revert
                  </button>
                </div>
              </header>

              <div className="cursor-grid">
                {roleOrder.map((role) => {
                  const cursor = selectedPack.roles[role];
                  if (!cursor) return null;
                  const [hotspotX = 0, hotspotY = 0] = cursor.hotspot;
                  const liveHover = selectedPack.installed ? cursor.hover : "";
                  const movePreview = (event: MouseEvent) => {
                    if (!liveHover) return;
                    setHoverPreview({
                      url: liveHover,
                      left: event.clientX - hotspotX,
                      top: event.clientY - hotspotY,
                    });
                  };
                  return (
                    <div
                      className={`cursor-state${liveHover ? " has-live-hover" : ""}`}
                      key={role}
                      onMouseEnter={liveHover ? movePreview : undefined}
                      onMouseMove={liveHover ? movePreview : undefined}
                      onMouseLeave={() => setHoverPreview(null)}
                    >
                      <div className="state-preview">
                        <img src={cursor.preview} alt="" />
                      </div>
                      <span>{roleLabels[role]}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <>
              {activeItem === "Settings" ? (
                <section className="settings-page">
                  <h1>Settings</h1>
                  <div className="settings-list">
                    <button type="button" onClick={() => void importFolder()}>▣ Import folder</button>
                    <button type="button" onClick={() => void openLibrary()}>Open library folder</button>
                    <button type="button" onClick={() => void refreshRemoteCatalog()}>Refresh catalog</button>
                  </div>
                  <p>Online catalog: <strong>{remoteStatus}</strong></p>
                  <span role="status">{status}</span>
                  <small>Beepo Cursors · 1.2</small>
                </section>
              ) : (
                <>
                  <div className="installed-heading">
                    <h1>Browse</h1>
                    <button
                      className="installed-search-toggle"
                      type="button"
                      aria-label="Search cursors"
                      aria-expanded={browseSearchOpen}
                      onClick={() => setBrowseSearchOpen((open) => !open)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="10.5" cy="10.5" r="5.5" />
                        <path d="m15 15 4.5 4.5" />
                      </svg>
                    </button>
                  </div>
                  {browseSearchOpen && (
                    <input
                      ref={browseSearchInput}
                      className="installed-search"
                      type="search"
                      value={browseSearch}
                      onChange={(event) => setBrowseSearch(event.target.value)}
                      placeholder="Search cursors"
                      aria-label="Search cursors"
                    />
                  )}
                  {featuredPacks.length > 0 && (
                    <section className="pack-section">
                      <h2>Featured</h2>
                      <PackGrid
                        items={featuredPacks}
                        onSelect={(packId) => void transitionContent(activeItem, packId)}
                        onCreator={openCreator}
                      />
                    </section>
                  )}
                  <section className="pack-section">
                    <h2>All cursors</h2>
                    <FamilyGrid
                      items={visiblePacks}
                      onSelect={(packId) => void transitionContent(activeItem, packId)}
                    />
                  </section>
                </>
              )}
            </>
          )}
          </div>
        </main>
      </div>
      {hoverPreview && (
        <img
          className="cursor-overlay"
          src={hoverPreview.url}
          alt=""
          style={{ left: hoverPreview.left, top: hoverPreview.top }}
        />
      )}
    </div>
  );
}
