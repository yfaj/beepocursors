import { invoke } from "@tauri-apps/api/core";

export const REMOTE_CATALOG_URL = "https://cursors.lie.red/distribution.php";
const MAX_REMOTE_PACKAGE_BYTES = 8 * 1024 * 1024;

export const roleOrder = [
  "arrow",
  "help",
  "workingInBackground",
  "busy",
  "precisionSelect",
  "textSelect",
  "handwriting",
  "unavailable",
  "verticalResize",
  "horizontalResize",
  "diagonalResize1",
  "diagonalResize2",
  "move",
  "alternateSelect",
  "linkSelect",
  "personSelect",
  "locationSelect",
] as const;

export type CursorRole = (typeof roleOrder)[number];

export type PackRole = {
  file: string;
  preview: string;
  hover: string;
  hotspot: number[];
};

export type RemotePack = {
  id: string;
  name: string;
  author: string;
  authorUrl: string;
  family: string;
  variant: string;
  fingerprint: string;
  preview: string;
  linkPreview: string;
  downloadable: boolean;
  manifestHash: string;
  packageUrl: string;
  packageSha256: string;
  packageBytes: number;
  roles?: Partial<Record<CursorRole, PackRole>>;
};

const companionUrlPattern = /^beepocursors:\/\/apply\/([a-z0-9][a-z0-9-]{0,127})$/;
const canonicalPackId = /^[a-z0-9][a-z0-9-]{0,127}$/;
const fingerprintPattern = /^[a-f0-9]{64}$/;

export function companionPackId(urls: string[] | null) {
  for (const url of urls ?? []) {
    const match = companionUrlPattern.exec(url);
    if (match) return match[1];
  }
  return null;
}

function remoteAssetUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, REMOTE_CATALOG_URL);
    return url.origin === new URL(REMOTE_CATALOG_URL).origin ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseRemotePacks(value: unknown): RemotePack[] {
  const candidates = (value as { packs?: unknown })?.packs;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const pack = candidate as Record<string, unknown>;
    const preview = remoteAssetUrl(pack.preview);
    const linkPreview = remoteAssetUrl(pack.linkPreview) ?? preview;
    const downloadable = pack.downloadable === true;
    const packageUrl = remoteAssetUrl(pack.packageUrl) ?? "";
    const packageBytes = Number(pack.packageBytes ?? 0);
    if (!canonicalPackId.test(String(pack.id ?? "")) || typeof pack.name !== "string"
      || typeof pack.author !== "string" || typeof pack.family !== "string" || typeof pack.variant !== "string"
      || !fingerprintPattern.test(String(pack.fingerprint ?? "")) || !fingerprintPattern.test(String(pack.manifestHash ?? ""))
      || !preview || !linkPreview || (downloadable && (!packageUrl
        || !fingerprintPattern.test(String(pack.packageSha256 ?? ""))
        || !Number.isSafeInteger(packageBytes) || packageBytes < 1 || packageBytes > MAX_REMOTE_PACKAGE_BYTES))) return [];
    return [{
      id: pack.id as string,
      name: pack.name,
      author: pack.author,
      authorUrl: typeof pack.authorUrl === "string" && pack.authorUrl.startsWith("https://") ? pack.authorUrl : "",
      family: pack.family,
      variant: pack.variant,
      fingerprint: pack.fingerprint as string,
      preview,
      linkPreview,
      downloadable,
      manifestHash: pack.manifestHash as string,
      packageUrl,
      packageSha256: downloadable ? pack.packageSha256 as string : "",
      packageBytes: downloadable ? packageBytes : 0,
    }];
  });
}

export function parseRemotePackDetail(value: unknown) {
  const summary = parseRemotePacks({ packs: [value] })[0];
  const sourceRoles = (value as { roles?: unknown })?.roles;
  if (!summary || !sourceRoles || typeof sourceRoles !== "object") return null;
  const roles: Partial<Record<CursorRole, PackRole>> = {};
  for (const role of roleOrder) {
    const source = (sourceRoles as Record<string, unknown>)[role];
    if (!source || typeof source !== "object") continue;
    const entry = source as Record<string, unknown>;
    const preview = remoteAssetUrl(entry.preview);
    const hover = remoteAssetUrl(entry.hover) ?? "";
    const hotspot = Array.isArray(entry.hotspot)
      && entry.hotspot.length === 2
      && entry.hotspot.every((point) => Number.isInteger(point) && point >= 0 && point <= 31)
      ? entry.hotspot as number[]
      : [0, 0];
    if (preview) roles[role] = { file: "", preview, hover, hotspot };
  }
  return roles.arrow ? { ...summary, roles } : null;
}

export async function installRemotePack(pack: RemotePack, onProgress: (progress: number) => void) {
  if (!pack.downloadable || !pack.packageUrl || !pack.packageSha256
    || !pack.manifestHash || !pack.fingerprint || !pack.packageBytes) {
    throw new Error("This cursor pack is not downloadable.");
  }
  const response = await fetch(pack.packageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not download this cursor pack.");
  const reader = response.body?.getReader();
  let packageBytes: Uint8Array;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > pack.packageBytes || received > MAX_REMOTE_PACKAGE_BYTES) {
        await reader.cancel();
        throw new Error("Downloaded cursor package has the wrong size.");
      }
      chunks.push(value);
      onProgress(received / pack.packageBytes);
    }
    packageBytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      packageBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    packageBytes = new Uint8Array(await response.arrayBuffer());
  }
  if (packageBytes.byteLength !== pack.packageBytes || packageBytes.byteLength > MAX_REMOTE_PACKAGE_BYTES) {
    throw new Error("Downloaded cursor package has the wrong size.");
  }
  onProgress(1);
  await invoke("install_remote_cursor_pack", {
    packId: pack.id,
    packageBytes: Array.from(packageBytes),
    expectedBytes: pack.packageBytes,
    packageSha256: pack.packageSha256,
    manifestHash: pack.manifestHash,
    fingerprint: pack.fingerprint,
  });
}
