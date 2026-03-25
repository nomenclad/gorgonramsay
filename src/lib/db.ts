import Dexie, { type Table } from "dexie";

/** Raw cached CDN file, keyed by "v{version}/{filename}" e.g. "v465/items.json" */
export interface CachedFile {
  key: string;    // "v465/items.json"
  version: number;
  filename: string;
  content: string; // raw JSON text
  cachedAt: number; // unix ms
}

export interface CacheMetadata {
  key: string;
  value: string;
}

export class PgDatabase extends Dexie {
  cdnFiles!: Table<CachedFile>;
  metadata!: Table<CacheMetadata>;
  fsHandles!: Table<{ key: string; handle: FileSystemDirectoryHandle }>;

  constructor() {
    super("pgefficiency");
    // Version 2: unified cdnFiles table replaces separate recipe/item/xpTable tables
    this.version(2).stores({
      cdnFiles: "key, version, filename",
      metadata: "key",
    });
    // Version 3: persist FileSystemDirectoryHandle for web folder watch
    this.version(3).stores({
      cdnFiles: "key, version, filename",
      metadata: "key",
      fsHandles: "key",
    });
  }
}

export const db = new PgDatabase();

/** Returns the cached version number stored in metadata, or null. */
export async function getCachedVersion(): Promise<number | null> {
  const meta = await db.metadata.get("cdnVersion");
  return meta ? Number(meta.value) : null;
}

/** Persists the cached version number. */
export async function setCachedVersion(version: number): Promise<void> {
  await db.metadata.put({ key: "cdnVersion", value: String(version) });
}

/** Get a single cached CDN file's content, or null if not cached for this version. */
export async function getCachedFile(
  version: number,
  filename: string
): Promise<string | null> {
  const key = `v${version}/${filename}`;
  const row = await db.cdnFiles.get(key);
  return row?.content ?? null;
}

/** Store a CDN file in the cache. */
export async function setCachedFile(
  version: number,
  filename: string,
  content: string
): Promise<void> {
  const key = `v${version}/${filename}`;
  await db.cdnFiles.put({ key, version, filename, content, cachedAt: Date.now() });
}

/** Remove all cached files for versions other than the given one. */
export async function evictOldVersions(currentVersion: number): Promise<void> {
  await db.cdnFiles
    .where("version")
    .notEqual(currentVersion)
    .delete();
}

/** Clear everything. */
export async function clearCache(): Promise<void> {
  await Promise.all([db.cdnFiles.clear(), db.metadata.clear()]);
}

/** Store a FileSystemDirectoryHandle for the web folder watch feature. */
export async function storeDirectoryHandle(
  key: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await db.fsHandles.put({ key, handle });
}

/** Retrieve a previously stored FileSystemDirectoryHandle. */
export async function getStoredDirectoryHandle(
  key: string,
): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.fsHandles.get(key);
  return row?.handle ?? null;
}

/** Remove a stored directory handle. */
export async function clearDirectoryHandle(key: string): Promise<void> {
  await db.fsHandles.delete(key);
}
