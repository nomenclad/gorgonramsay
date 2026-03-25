/**
 * IndexedDB persistence layer using Dexie.js.
 *
 * Stores four tables in the "pgefficiency" database:
 *  - cdnFiles:   Cached game-data JSON files from the Project Gorgon CDN, keyed by version + filename.
 *  - metadata:   Key-value pairs (currently just the cached CDN version number).
 *  - fsHandles:  Persisted FileSystemDirectoryHandle for the web folder-watch feature.
 *  - userFiles:  User-uploaded character and inventory JSON blobs.
 *
 * Schema versioning: Dexie handles migrations automatically. Each new table or index
 * change bumps the version number in the constructor. To add a new table, add a new
 * `this.version(N+1).stores({...})` block — Dexie replays all version steps in order.
 *
 * Eviction strategy: When the CDN version changes, `evictOldVersions()` deletes all
 * cdnFiles rows whose version doesn't match, so only one version is cached at a time.
 *
 * How to change:
 *  - To add a new table: bump the version number and add the table to the stores object.
 *  - To add an index to an existing table: bump the version and include the new index.
 *  - Never remove or rename existing version blocks — Dexie needs them for upgrades.
 */
import Dexie, { type Table } from "dexie";

/** Raw cached CDN file, keyed by "v{version}/{filename}" e.g. "v465/items.json" */
export interface CachedFile {
  key: string;    // composite key: "v{version}/{filename}" — used as primary key in IndexedDB
  version: number; // CDN version number — indexed so we can evict old versions in bulk
  filename: string; // bare filename like "items.json" — indexed for lookup by name
  content: string; // raw JSON text, stored as-is (not parsed) to avoid serialization overhead
  cachedAt: number; // unix ms — retained for debugging, not currently used for eviction
}

export interface CacheMetadata {
  key: string;
  value: string;
}

export interface StoredHandle {
  key: string;
  handle: FileSystemDirectoryHandle;
}

export class PgDatabase extends Dexie {
  cdnFiles!: Table<CachedFile>;
  metadata!: Table<CacheMetadata>;
  fsHandles!: Table<{ key: string; handle: FileSystemDirectoryHandle }>;
  userFiles!: Table<{ key: string; content: string }>;

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
    // Version 4: persist user-uploaded character/inventory JSON
    this.version(4).stores({
      cdnFiles: "key, version, filename",
      metadata: "key",
      fsHandles: "key",
      userFiles: "key",
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

/** Store a user file (character or inventory JSON). */
export async function storeUserFile(
  key: string,
  content: string,
): Promise<void> {
  await db.userFiles.put({ key, content });
}

/** Retrieve a user file. */
export async function getUserFile(key: string): Promise<string | null> {
  const row = await db.userFiles.get(key);
  return row?.content ?? null;
}
