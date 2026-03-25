/**
 * @module useWebFolderWatch
 *
 * Web-only folder watch using the File System Access API.
 * Mirrors the Tauri auto-watch behaviour: polls the selected directory
 * every 5 seconds and reloads character / inventory when files change.
 *
 * Chrome / Edge only — falls back gracefully (hook returns
 * `supported: false` on unsupported browsers).
 *
 * **Data flow:** User picks a folder via `pickFolder()` -> the directory
 * handle is persisted to IndexedDB so it survives reloads -> `loadLatest()`
 * reads the newest Character_*.json and *_items_*.json files -> parsed
 * data is pushed into `characterStore` and `inventoryStore` -> raw JSON
 * is also saved to IndexedDB `userFiles` for offline hydration.
 *
 * **Persistence:** The directory handle is stored in IndexedDB. The
 * auto-watch preference (`watching`) is stored in localStorage. On
 * reload, the hook restores the handle and checks if permission is
 * still granted; if not, it sets `needsPermission` so the UI can
 * prompt the user to re-grant with a click (browser security requires
 * a user gesture).
 *
 * **How to extend:** To watch a new file type, add a case to
 * `classifyFile()` and handle it in `loadLatest()` / the polling effect.
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
  /** Load the latest character + inventory from the selected folder */
  loadLatest: () => Promise<void>;
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

  /* ---- loadLatest ---- */
  const loadLatest = useCallback(async () => {
    const handle = dirHandleRef.current;
    if (!handle) {
      addStatus("✗ No folder selected");
      return;
    }
    try {
      const perm = await handle.queryPermission({ mode: "read" });
      if (perm !== "granted") {
        setNeedsPermission(true);
        addStatus("✗ Folder permission expired — please re-grant");
        return;
      }
      const files = await listReportFiles(handle);
      let loaded = 0;

      const charFile = files.find((f) => f.type === "character");
      if (charFile) {
        const file = await charFile.handle.getFile();
        const json = await file.text();
        const sheet = parseCharacterSheet(json);
        setCharacter(sheet);
        storeUserFile("character", json).catch(() => {});
        addStatus(`✓ Character loaded: ${sheet.Character} @ ${sheet.ServerName}`);
        lastCharTsRef.current = charFile.lastModified;
        loaded++;
      }

      const invFile = files.find((f) => f.type === "inventory");
      if (invFile) {
        const file = await invFile.handle.getFile();
        const json = await file.text();
        const inv = parseInventory(json);
        setInventory(inv.Items, inv.Timestamp, inv.Character);
        storeUserFile("inventory", json).catch(() => {});
        addStatus(`✓ Inventory loaded: ${inv.Items.length} items`);
        lastInvTsRef.current = invFile.lastModified;
        loaded++;
      }

      if (loaded === 0) addStatus("No character or inventory files found in folder");
    } catch (e) {
      addStatus(`✗ Error loading files: ${e}`);
    }
  }, [addStatus, setCharacter, setInventory]);

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
    loadLatest,
    watching,
    setWatching,
    watchStatus,
  };
}
