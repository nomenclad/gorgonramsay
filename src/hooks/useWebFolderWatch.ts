/**
 * Web-only folder watch using the File System Access API.
 * Mirrors the Tauri auto-watch behaviour: polls the selected directory
 * every 5 seconds and reloads character / inventory when files change.
 *
 * Chrome / Edge only — falls back gracefully (hook returns
 * `supported: false` on unsupported browsers).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useCharacterStore } from "../stores/characterStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { parseCharacterSheet } from "../lib/parsers/characterParser";
import { parseInventory } from "../lib/parsers/inventoryParser";
import {
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearDirectoryHandle,
  storeUserFile,
} from "../lib/db";

/* ------------------------------------------------------------------ */
/*  Ambient types — File System Access API is not in TS stdlib yet     */
/* ------------------------------------------------------------------ */
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<
      FileSystemFileHandle | FileSystemDirectoryHandle
    >;
    queryPermission(desc: {
      mode: "read" | "readwrite";
    }): Promise<PermissionState>;
    requestPermission(desc: {
      mode: "read" | "readwrite";
    }): Promise<PermissionState>;
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const HANDLE_KEY = "reportsFolder";

export const supportsFileSystemAccess: boolean =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

interface WebReportFile {
  name: string;
  type: "character" | "inventory";
  lastModified: number; // ms
  handle: FileSystemFileHandle;
}

function classifyFile(name: string): "character" | "inventory" | null {
  if (name.startsWith("Character_") && name.endsWith(".json"))
    return "character";
  if (name.includes("_items_") && name.endsWith(".json")) return "inventory";
  return null;
}

async function listReportFiles(
  dirHandle: FileSystemDirectoryHandle,
): Promise<WebReportFile[]> {
  const results: WebReportFile[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== "file") continue;
    const fileType = classifyFile(entry.name);
    if (!fileType) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    results.push({
      name: entry.name,
      type: fileType,
      lastModified: file.lastModified,
      handle: entry as FileSystemFileHandle,
    });
  }
  return results.sort((a, b) => b.lastModified - a.lastModified);
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface WebFolderWatch {
  supported: boolean;
  /** Name of the selected folder, or null */
  folderName: string | null;
  /** True when a previously-stored handle needs a user-gesture to re-grant */
  needsPermission: boolean;
  /** Re-request read permission (must be called from a click handler) */
  requestPermission: () => Promise<void>;
  /** Opens the directory picker */
  pickFolder: () => Promise<void>;
  /** Disconnect the folder and clear stored handle */
  disconnect: () => Promise<void>;
  /** Whether auto-watch polling is active */
  watching: boolean;
  /** Toggle auto-watch on/off */
  setWatching: (v: boolean) => void;
  /** Human-readable status string */
  watchStatus: string | null;
}

export function useWebFolderWatch(
  addStatus: (msg: string) => void,
): WebFolderWatch {
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const setInventory = useInventoryStore((s) => s.setInventory);

  const [folderName, setFolderName] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [watching, setWatching] = useState(
    () => localStorage.getItem("webAutoWatch") === "true",
  );
  const [watchStatus, setWatchStatus] = useState<string | null>(null);

  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const lastCharTsRef = useRef<number>(0);
  const lastInvTsRef = useRef<number>(0);

  // Persist watch preference
  useEffect(() => {
    localStorage.setItem("webAutoWatch", watching ? "true" : "false");
  }, [watching]);

  /* ---- Restore persisted handle on mount ---- */
  useEffect(() => {
    if (!supportsFileSystemAccess) return;
    (async () => {
      try {
        const handle = await getStoredDirectoryHandle(HANDLE_KEY);
        if (!handle) return;
        const perm = await handle.queryPermission({ mode: "read" });
        if (perm === "granted") {
          dirHandleRef.current = handle;
          setFolderName(handle.name);
        } else {
          // Need user gesture to re-grant
          dirHandleRef.current = handle;
          setFolderName(handle.name);
          setNeedsPermission(true);
        }
      } catch {
        // Handle may have been invalidated
        await clearDirectoryHandle(HANDLE_KEY).catch(() => {});
      }
    })();
  }, []);

  /* ---- requestPermission ---- */
  const requestPermission = useCallback(async () => {
    const handle = dirHandleRef.current;
    if (!handle) return;
    try {
      const perm = await handle.requestPermission({ mode: "read" });
      if (perm === "granted") {
        setNeedsPermission(false);
        addStatus(`✓ Folder access re-granted: ${handle.name}`);
      } else {
        addStatus("✗ Permission denied — please try again");
      }
    } catch {
      addStatus("✗ Permission request failed");
    }
  }, [addStatus]);

  /* ---- pickFolder ---- */
  const pickFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({
        id: "pg-reports",
        mode: "read",
      });
      dirHandleRef.current = handle;
      setFolderName(handle.name);
      setNeedsPermission(false);
      await storeDirectoryHandle(HANDLE_KEY, handle);

      // Preview files found
      const files = await listReportFiles(handle);
      const charCount = files.filter((f) => f.type === "character").length;
      const invCount = files.filter((f) => f.type === "inventory").length;
      addStatus(
        `✓ Folder selected: ${handle.name} — ${charCount} character, ${invCount} inventory files`,
      );
    } catch (e: unknown) {
      // User cancelled the picker
      if (e instanceof DOMException && e.name === "AbortError") return;
      addStatus(`✗ Error selecting folder: ${e}`);
    }
  }, [addStatus]);

  /* ---- disconnect ---- */
  const disconnect = useCallback(async () => {
    dirHandleRef.current = null;
    setFolderName(null);
    setNeedsPermission(false);
    setWatching(false);
    setWatchStatus(null);
    lastCharTsRef.current = 0;
    lastInvTsRef.current = 0;
    await clearDirectoryHandle(HANDLE_KEY).catch(() => {});
    addStatus("Folder disconnected");
  }, [addStatus]);

  /* ---- Polling effect ---- */
  useEffect(() => {
    if (!watching || !dirHandleRef.current || needsPermission) return;

    let isFirstPoll = true;
    let cancelled = false;

    const poll = async () => {
      const handle = dirHandleRef.current;
      if (!handle || cancelled) return;

      try {
        // Verify permission is still valid
        const perm = await handle.queryPermission({ mode: "read" });
        if (perm !== "granted") {
          setNeedsPermission(true);
          setWatchStatus("Permission lost — click to re-grant");
          return;
        }

        const files = await listReportFiles(handle);
        const charFile = files.find((f) => f.type === "character");
        const invFile = files.find((f) => f.type === "inventory");

        if (!isFirstPoll) {
          // Reload character if changed
          if (charFile && charFile.lastModified > lastCharTsRef.current) {
            try {
              const file = await charFile.handle.getFile();
              const json = await file.text();
              const sheet = parseCharacterSheet(json);
              setCharacter(sheet);
              storeUserFile("character", json).catch(() => {});
              setWatchStatus(
                `Character updated at ${new Date().toLocaleTimeString()}`,
              );
            } catch {
              /* silent */
            }
          }
          // Reload inventory if changed
          if (invFile && invFile.lastModified > lastInvTsRef.current) {
            try {
              const file = await invFile.handle.getFile();
              const json = await file.text();
              const inv = parseInventory(json);
              setInventory(inv.Items, inv.Timestamp, inv.Character);
              storeUserFile("inventory", json).catch(() => {});
              setWatchStatus(
                `Inventory updated at ${new Date().toLocaleTimeString()}`,
              );
            } catch {
              /* silent */
            }
          }
        }

        // Seed / update timestamps
        if (charFile) lastCharTsRef.current = charFile.lastModified;
        if (invFile) lastInvTsRef.current = invFile.lastModified;
        isFirstPoll = false;
      } catch {
        /* folder may be temporarily inaccessible */
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watching, needsPermission, setCharacter, setInventory]);

  return {
    supported: supportsFileSystemAccess,
    folderName,
    needsPermission,
    requestPermission,
    pickFolder,
    disconnect,
    watching,
    setWatching,
    watchStatus,
  };
}
