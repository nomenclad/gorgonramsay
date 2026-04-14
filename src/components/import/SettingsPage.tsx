/**
 * Settings tab: handles game data import from CDN, character/inventory file loading,
 * CDN cache refresh, theme selection, and file system watch configuration (Tauri).
 * This is the primary entry point for bootstrapping the app with game data.
 * To add new settings, append a section to the returned JSX layout.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { isTauri, supportsFileSystemAccess } from "../../lib/platform";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useAltStore, charId } from "../../stores/altStore";
import {
  parseRecipes,
  buildRecipeIndexes,
} from "../../lib/parsers/recipeParser";
import { parseItems, buildItemIndexes } from "../../lib/parsers/itemParser";
import { parseCharacterSheet } from "../../lib/parsers/characterParser";
import type { CharacterSheet } from "../../types/character";
import { parseInventory } from "../../lib/parsers/inventoryParser";
import { parseEatenFoods } from "../../lib/parsers/eatenFoodsParser";
import { parseXpTables } from "../../lib/parsers/xpTableParser";
import { parseSourcesData, parseNpcNames } from "../../lib/parsers/sourceParser";
import {
  loadAllCdnFiles,
  ALL_CDN_FILES,
  type DownloadProgress,
} from "../../lib/cdnLoader";
import { getCachedVersion, storeUserFile, deleteUserFile } from "../../lib/db";
import {
  type ReportFile,
  pickDirectory,
  getStoredHandle,
  clearStoredHandle,
  verifyPermission,
  requestPermission,
  listReportFiles,
  readFileContent,
} from "../../lib/fileAccess";
import { useWebFolderWatch } from "../../hooks/useWebFolderWatch";
import { TagsSettingsSection } from "./TagsSettingsSection";

const THEMES = [
  { id: "default", label: "Night (Default)" },
  { id: "slate",   label: "Slate" },
  { id: "midnight",label: "Midnight" },
  { id: "forest",  label: "Forest" },
  { id: "warm",    label: "Warm" },
];

function applyTheme(id: string) {
  if (id === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
  localStorage.setItem("theme", id);
}

export function SettingsPage() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? "default");
  const setRecipes = useGameDataStore((s) => s.setRecipes);
  const setItems = useGameDataStore((s) => s.setItems);
  const setXpTables = useGameDataStore((s) => s.setXpTables);
  const setSources = useGameDataStore((s) => s.setSources);
  const setRecipeSources = useGameDataStore((s) => s.setRecipeSources);
  const setNpcNames = useGameDataStore((s) => s.setNpcNames);
  const setItemUsesJson = useGameDataStore((s) => s.setItemUsesJson);
  const setStorageVaults = useGameDataStore((s) => s.setStorageVaults);
  const setAreas = useGameDataStore((s) => s.setAreas);
  const setCdnVersion = useGameDataStore((s) => s.setCdnVersion);
  const setLoading = useGameDataStore((s) => s.setLoading);
  const loading = useGameDataStore((s) => s.loading);
  const loaded = useGameDataStore((s) => s.loaded);
  const sourcesLoaded = useGameDataStore((s) => s.sourcesLoaded);
  const eatenFoods = useCharacterStore((s) => s.eatenFoods);
  const setInventory = useInventoryStore((s) => s.setInventory);
  const character = useCharacterStore((s) => s.character);
  const inventoryTimestamp = useInventoryStore((s) => s.importTimestamp);

  const [pgPath, setPgPath] = useState<string | null>(null);
  const [reportFiles, setReportFiles] = useState<ReportFile[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [cachedVersion, setCachedVersion_] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<
    Map<string, DownloadProgress>
  >(new Map());
  const [isDownloading, setIsDownloading] = useState(false);
  const [autoWatch, setAutoWatch] = useState(() => localStorage.getItem("autoWatch") === "true");
  const [autoWatchStatus, setAutoWatchStatus] = useState<string | null>(null);
  const [needsPermissionGrant, setNeedsPermissionGrant] = useState(false);

  // Refs for polling — avoids stale closures inside setInterval
  const pgPathRef = useRef<string | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const lastCharTimestampRef = useRef<number>(0);
  const lastInvTimestampRef = useRef<number>(0);

  const addStatus = useCallback(
    (msg: string) => setStatus((prev) => [...prev, msg]),
    []
  );

  const webFolder = useWebFolderWatch(addStatus);

  // --- Multi-character import helpers ---
  // Routes character/inventory imports through altStore and persists with character-keyed keys.
  const importCharacter = useCallback((sheet: CharacterSheet, json: string) => {
    const id = charId(sheet.Character, sheet.ServerName);
    const as = useAltStore.getState();
    as.loadCharacter(sheet);
    // If this is the first character or matches active, set as active
    if (!as.activeCharId || as.activeCharId === id) {
      as.setActiveCharacter(id);
    } else {
      // New alt detected — still set active to keep legacy stores in sync
      // but user can switch later via the header dropdown
    }
    storeUserFile(`character:${id}`, json).catch(() => {});
    return id;
  }, []);

  const importInventory = useCallback((inv: import("../../types/inventory").InventoryExport, json: string) => {
    const id = charId(inv.Character, inv.ServerName);
    const as = useAltStore.getState();
    // If we have this character loaded, update their inventory
    if (as.alts.has(id)) {
      as.loadInventory(id, inv.Items, inv.Timestamp);
    } else {
      // Character not yet loaded — still store it, will be picked up on next hydrate
    }
    // Also update legacy stores if this is the active character
    if (as.activeCharId === id) {
      setInventory(inv.Items, inv.Timestamp, inv.Character);
    }
    storeUserFile(`inventory:${id}`, json).catch(() => {});
    return id;
  }, [setInventory]);

  const importEatenFoods = useCallback((eaten: Map<string, number>, text: string) => {
    const as = useAltStore.getState();
    const activeId = as.activeCharId;
    if (activeId) {
      as.loadEatenFoods(activeId, eaten);
      storeUserFile(`eatenFoods:${activeId}`, text).catch(() => {});
    }
  }, []);

  // Keep pgPathRef in sync
  useEffect(() => { pgPathRef.current = pgPath; }, [pgPath]);

  // Persist autoWatch preference
  useEffect(() => {
    localStorage.setItem("autoWatch", autoWatch ? "true" : "false");
  }, [autoWatch]);

  // Silent loaders used by the auto-watch poller
  const silentLoadCharacter = useCallback(async (files: ReportFile[]) => {
    const source = isTauri ? pgPathRef.current : dirHandleRef.current;
    if (!source) return;
    const charFile = files.find((f) => f.file_type === "character");
    if (!charFile) return;
    try {
      const json = await readFileContent(source, charFile.path);
      const sheet = parseCharacterSheet(json);
      importCharacter(sheet, json);
      setAutoWatchStatus(`Character updated at ${new Date().toLocaleTimeString()}`);
    } catch { /* silent */ }
  }, [importCharacter]);

  const silentLoadInventory = useCallback(async (files: ReportFile[]) => {
    const source = isTauri ? pgPathRef.current : dirHandleRef.current;
    if (!source) return;
    const invFiles = files
      .filter((f) => f.file_type === "inventory")
      .sort((a, b) => b.modified_timestamp - a.modified_timestamp);
    if (invFiles.length === 0) return;
    try {
      const json = await readFileContent(source, invFiles[0].path);
      const inv = parseInventory(json);
      importInventory(inv, json);
      setAutoWatchStatus(`Inventory updated at ${new Date().toLocaleTimeString()}`);
    } catch { /* silent */ }
  }, [importInventory]);

  // Auto-watch polling effect — checks every 5s for new/updated report files
  useEffect(() => {
    if (!autoWatch || !pgPath) return;

    let isFirstPoll = true;

    const poll = async () => {
      const source = isTauri ? pgPathRef.current : dirHandleRef.current;
      if (!source) return;
      try {
        const files = await listReportFiles(source);

        const charFile = files.find((f) => f.file_type === "character");
        const invFile = files
          .filter((f) => f.file_type === "inventory")
          .sort((a, b) => b.modified_timestamp - a.modified_timestamp)[0];

        if (!isFirstPoll) {
          if (charFile && charFile.modified_timestamp > lastCharTimestampRef.current) {
            await silentLoadCharacter(files);
          }
          if (invFile && invFile.modified_timestamp > lastInvTimestampRef.current) {
            await silentLoadInventory(files);
          }
        }

        if (charFile) lastCharTimestampRef.current = charFile.modified_timestamp;
        if (invFile) lastInvTimestampRef.current = invFile.modified_timestamp;
        isFirstPoll = false;
      } catch {
        // silent — folder may be temporarily inaccessible or permission lost
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [autoWatch, pgPath, silentLoadCharacter, silentLoadInventory]);

  // Load cached version on mount
  useEffect(() => {
    getCachedVersion().then((v) => {
      setCachedVersion_(v);
      if (v) setCdnVersion(v);
    });
  }, [setCdnVersion]);

  // Detect PG install path on mount (Tauri only)
  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const pg = await invoke<string | null>("detect_pg_path");
        setPgPath(pg);
        if (pg) {
          const files = await invoke<ReportFile[]>("list_report_files", { reportsPath: pg });
          setReportFiles(files);
        }
      } catch {
        // silent — user can drag-drop manually
      }
    })();
  }, []);

  // Restore stored directory handle on mount (web only)
  useEffect(() => {
    if (isTauri || !supportsFileSystemAccess) return;
    (async () => {
      try {
        const handle = await getStoredHandle();
        if (!handle) return;
        const perm = await verifyPermission(handle);
        if (perm === "granted") {
          dirHandleRef.current = handle;
          setPgPath(handle.name);
          const files = await listReportFiles(handle);
          setReportFiles(files);
        } else if (perm === "prompt") {
          dirHandleRef.current = handle;
          setNeedsPermissionGrant(true);
        } else {
          await clearStoredHandle();
        }
      } catch {
        // silent — handle may be stale
      }
    })();
  }, []);

  /** Apply loaded CDN file content to stores */
  const applyCdnFiles = useCallback(
    (files: Record<string, string>) => {
      if (files["recipes.json"]) {
        const recipes = parseRecipes(files["recipes.json"]);
        const indexes = buildRecipeIndexes(recipes);
        setRecipes(recipes, indexes);
        addStatus(`✓ ${recipes.length} recipes loaded`);
      }
      if (files["items.json"]) {
        const items = parseItems(files["items.json"]);
        const indexes = buildItemIndexes(items);
        setItems(items, indexes);
        addStatus(`✓ ${items.length} items loaded`);
      }
      if (files["xptables.json"]) {
        const tables = parseXpTables(files["xptables.json"]);
        setXpTables(tables);
        addStatus(`✓ ${tables.length} XP tables loaded`);
      }
      if (files["sources_items.json"]) {
        const sources = parseSourcesData(files["sources_items.json"]);
        setSources(sources);
        addStatus(`✓ Item sources loaded`);
      }
      if (files["sources_recipes.json"]) {
        const sources = parseSourcesData(files["sources_recipes.json"]);
        setRecipeSources(sources);
        addStatus(`✓ Recipe sources loaded`);
      }
      if (files["npcs.json"]) {
        const npcMap = parseNpcNames(files["npcs.json"]);
        setNpcNames(npcMap);
        addStatus(`✓ ${npcMap.size} NPCs loaded`);
      }
      if (files["itemuses.json"]) {
        setItemUsesJson(files["itemuses.json"]);
        addStatus(`✓ Item uses (Gourmand) loaded`);
      }
      if (files["storagevaults.json"]) {
        setStorageVaults(files["storagevaults.json"]);
        addStatus(`✓ Storage vault names loaded`);
      }
      if (files["areas.json"]) {
        setAreas(files["areas.json"]);
        addStatus(`✓ Area names loaded`);
      }
    },
    [setRecipes, setItems, setXpTables, setSources, setRecipeSources, setNpcNames, setItemUsesJson, setStorageVaults, setAreas, addStatus]
  );

  const downloadFromCdn = useCallback(
    async (forceRefresh = false) => {
      setIsDownloading(true);
      setLoading(true);
      setStatus([]);
      const initial = new Map<string, DownloadProgress>(
        ALL_CDN_FILES.map((f) => [f, { filename: f, status: "pending" }])
      );
      setDownloadProgress(initial);

      try {
        addStatus(
          forceRefresh
            ? "Refreshing from CDN (force)..."
            : "Fetching latest game data from CDN..."
        );

        const result = await loadAllCdnFiles((progress) => {
          setDownloadProgress((prev) => {
            const next = new Map(prev);
            next.set(progress.filename, progress);
            return next;
          });
        }, forceRefresh);

        setCachedVersion_(result.version);
        setCdnVersion(result.version);
        addStatus(`✓ CDN version v${result.version}`);
        applyCdnFiles(result.files);
        addStatus("✓ All game data ready!");
      } catch (e) {
        addStatus(`✗ Error: ${e}`);
      } finally {
        setIsDownloading(false);
        setLoading(false);
      }
    },
    [addStatus, applyCdnFiles, setLoading]
  );

  const loadCharacter = useCallback(async () => {
    const source = isTauri ? pgPath : dirHandleRef.current;
    if (!source) { addStatus("No folder selected"); return; }
    const charFile = reportFiles.find((f) => f.file_type === "character");
    if (!charFile) { addStatus("No character file found"); return; }
    try {
      const json = await readFileContent(source, charFile.path);
      const sheet = parseCharacterSheet(json);
      importCharacter(sheet, json);
      addStatus(`✓ Character loaded: ${sheet.Character} @ ${sheet.ServerName} — ${Object.keys(sheet.Skills).length} skills`);
    } catch (e) {
      addStatus(`✗ Error loading character: ${e}`);
    }
  }, [reportFiles, addStatus, importCharacter, pgPath]);

  const loadInventory = useCallback(async () => {
    const source = isTauri ? pgPath : dirHandleRef.current;
    if (!source) { addStatus("No folder selected"); return; }
    const invFiles = reportFiles
      .filter((f) => f.file_type === "inventory")
      .sort((a, b) => b.modified_timestamp - a.modified_timestamp);
    if (invFiles.length === 0) { addStatus("No inventory files found"); return; }
    try {
      const json = await readFileContent(source, invFiles[0].path);
      const inv = parseInventory(json);
      importInventory(inv, json);
      addStatus(`✓ Inventory loaded: ${inv.Items.length} items from "${invFiles[0].filename}"`);
    } catch (e) {
      addStatus(`✗ Error loading inventory: ${e}`);
    }
  }, [reportFiles, addStatus, setInventory, pgPath]);

  // Drag-and-drop handler (fallback for local files)
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);

      for (const file of files) {
        const text = await file.text();
        if (file.name === "recipes.json") {
          const recipes = parseRecipes(text);
          const indexes = buildRecipeIndexes(recipes);
          setRecipes(recipes, indexes);
          addStatus(`✓ ${recipes.length} recipes loaded (drag-drop)`);
        } else if (file.name === "items.json") {
          const items = parseItems(text);
          const indexes = buildItemIndexes(items);
          setItems(items, indexes);
          addStatus(`✓ ${items.length} items loaded (drag-drop)`);
        } else if (file.name === "xptables.json") {
          const tables = parseXpTables(text);
          setXpTables(tables);
          addStatus(`✓ XP tables loaded (drag-drop)`);
        } else if (file.name === "sources_items.json") {
          const sources = parseSourcesData(text);
          setSources(sources);
          addStatus(`✓ Item sources loaded (drag-drop)`);
        } else if (file.name === "npcs.json") {
          const npcMap = parseNpcNames(text);
          setNpcNames(npcMap);
          addStatus(`✓ NPC data loaded: ${npcMap.size} NPCs (drag-drop)`);
        } else if (file.name.startsWith("Character_")) {
          const sheet = parseCharacterSheet(text);
          importCharacter(sheet, text);
          addStatus(`✓ Character loaded: ${sheet.Character} @ ${sheet.ServerName} (drag-drop)`);
        } else if (file.name.includes("_items_")) {
          const inv = parseInventory(text);
          importInventory(inv, text);
          addStatus(`✓ ${inv.Items.length} inventory items loaded for ${inv.Character} (drag-drop)`);
        } else if (file.name === "sources_recipes.json") {
          const sources = parseSourcesData(text);
          setRecipeSources(sources);
          addStatus(`✓ Recipe sources loaded (drag-drop)`);
        } else if (file.name === "itemuses.json") {
          setItemUsesJson(text);
          addStatus(`✓ Item uses (Gourmand) loaded (drag-drop)`);
        } else if (file.name.endsWith(".txt") && text.includes("Foods Consumed:")) {
          const eaten = parseEatenFoods(text);
          if (eaten) {
            importEatenFoods(eaten, text);
            addStatus(`✓ Gourmand eaten data loaded: ${eaten.size} foods (drag-drop)`);
          } else {
            addStatus(`✗ No 'Foods Consumed' section found in ${file.name}`);
          }
        } else {
          addStatus(`? Unrecognized file: ${file.name}`);
        }
      }
    },
    [addStatus, setRecipes, setItems, setXpTables, setSources, setRecipeSources, setNpcNames, setItemUsesJson, importCharacter, importInventory, importEatenFoods]
  );

  return (
    <div className="space-y-6 w-full">
      <h2 className="text-xl font-semibold">Settings & Data Import</h2>

      {/* CDN Download */}
      <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-sm">Game Data (CDN)</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Downloads the latest data directly from Project Gorgon's servers.
              {cachedVersion && (
                <span className="ml-1 text-accent">
                  Cached: v{cachedVersion}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => downloadFromCdn(false)}
              disabled={isDownloading || loading}
              className="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm transition-colors"
            >
              {isDownloading
                ? "Downloading..."
                : loaded
                ? "↻ Update Game Data"
                : "Download Game Data"}
            </button>
            {cachedVersion && (
              <button
                onClick={() => downloadFromCdn(true)}
                disabled={isDownloading || loading}
                title="Force re-download all files, ignoring cache"
                className="border border-border hover:border-accent disabled:opacity-40 text-text-secondary hover:text-text-primary px-3 py-2 rounded text-xs transition-colors"
              >
                Force refresh
              </button>
            )}
          </div>
        </div>

        {/* Per-file progress */}
        {downloadProgress.size > 0 && (
          <div className="space-y-1 pt-1">
            {ALL_CDN_FILES.map((filename) => {
              const p = downloadProgress.get(filename);
              if (!p) return null;
              return (
                <FileProgressRow key={filename} progress={p} />
              );
            })}
          </div>
        )}
      </section>

      {/* Character & Inventory */}
      <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-sm">Character & Inventory</h3>
        <div className="flex items-center gap-3">
          <p className="text-xs text-text-muted flex-1">
            {pgPath
              ? `Reports folder: ${pgPath}`
              : "PG install not auto-detected."}
          </p>
          {isTauri ? (
            <button
              onClick={async () => {
                const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
                const { invoke } = await import("@tauri-apps/api/core");
                const selected = await openDialog({ directory: true, multiple: false, title: "Select PG Reports Folder" });
                if (!selected) return;
                const folder = typeof selected === "string" ? selected : selected;
                setPgPath(folder);
                try {
                  const files = await invoke<ReportFile[]>("list_report_files", { reportsPath: folder });
                  setReportFiles(files);
                  addStatus(`✓ Found ${files.length} report files`);
                } catch (e) {
                  addStatus(`✗ Error reading folder: ${e}`);
                }
              }}
              className="shrink-0 border border-border hover:border-accent text-text-secondary hover:text-text-primary px-3 py-1.5 rounded text-xs transition-colors"
            >
              Browse…
            </button>
          ) : supportsFileSystemAccess ? (
            <div className="flex gap-2 shrink-0">
              {needsPermissionGrant ? (
                <button
                  onClick={async () => {
                    const handle = dirHandleRef.current;
                    if (!handle) return;
                    try {
                      const granted = await requestPermission(handle);
                      if (granted) {
                        setNeedsPermissionGrant(false);
                        setPgPath(handle.name);
                        const files = await listReportFiles(handle);
                        setReportFiles(files);
                        addStatus(`✓ Permission re-granted — ${files.length} report files`);
                      }
                    } catch {
                      addStatus("✗ Permission denied");
                    }
                  }}
                  className="shrink-0 bg-gold/20 hover:bg-gold/30 text-gold border border-gold/40 px-3 py-1.5 rounded text-xs transition-colors"
                >
                  Re-grant access
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      const handle = await pickDirectory();
                      dirHandleRef.current = handle;
                      setNeedsPermissionGrant(false);
                      setPgPath(handle.name);
                      const files = await listReportFiles(handle);
                      setReportFiles(files);
                      addStatus(`✓ Found ${files.length} report files`);
                    } catch (e: unknown) {
                      if (e instanceof DOMException && e.name === "AbortError") return;
                      addStatus(`✗ Error selecting folder: ${e}`);
                    }
                  }}
                  className="shrink-0 border border-border hover:border-accent text-text-secondary hover:text-text-primary px-3 py-1.5 rounded text-xs transition-colors"
                >
                  Select Reports Folder…
                </button>
              )}
              {pgPath && (
                <button
                  onClick={async () => {
                    dirHandleRef.current = null;
                    await clearStoredHandle();
                    setPgPath(null);
                    setReportFiles([]);
                    setNeedsPermissionGrant(false);
                    setAutoWatch(false);
                  }}
                  className="shrink-0 border border-border hover:border-danger/60 text-text-muted hover:text-danger px-3 py-1.5 rounded text-xs transition-colors"
                  title="Disconnect from this folder"
                >
                  Disconnect
                </button>
              )}
            </div>
          ) : null}
        </div>
        {reportFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => { await loadCharacter(); await loadInventory(); }}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
            >
              {character || inventoryTimestamp ? "↻ Reload Latest" : "Load Latest"}
            </button>
          </div>
        )}
        {reportFiles.filter((f) => f.file_type === "inventory").length > 0 && (
          <div className="text-xs text-text-muted space-y-0.5">
            {reportFiles
              .filter((f) => f.file_type === "inventory")
              .slice(0, 3)
              .map((f) => (
                <div key={f.path}>
                  📦 {f.filename}
                  <span className="ml-2 opacity-60">
                    {new Date(f.modified_timestamp * 1000).toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Auto-watch toggle */}
        {pgPath && (
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
            <div>
              <div className="text-sm text-text-primary">Auto-watch</div>
              <div className="text-xs text-text-muted">
                {autoWatch
                  ? autoWatchStatus ?? "Watching for new exports…"
                  : "Automatically reload when new reports appear"}
              </div>
            </div>
            <button
              onClick={() => {
                setAutoWatch((v) => !v);
                if (!autoWatch) setAutoWatchStatus(null);
              }}
              role="switch"
              aria-checked={autoWatch}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                autoWatch ? "bg-accent" : "bg-bg-primary border border-border"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  autoWatch ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        )}
      </section>

      {/* Web: Folder watch (File System Access API) + manual upload fallback */}
      {!isTauri && (
        <>
          {webFolder.supported && (
            <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-sm">Reports Folder</h3>
              <p className="text-xs text-text-muted">
                Select your PG Reports folder to enable automatic character & inventory tracking.
                {" "}Works in Chrome and Edge.
              </p>

              <div className="flex items-center gap-3">
                <p className="text-xs text-text-muted flex-1">
                  {webFolder.folderName
                    ? `Folder: ${webFolder.folderName}`
                    : "No folder selected"}
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={webFolder.pickFolder}
                    className="border border-border hover:border-accent text-text-secondary hover:text-text-primary px-3 py-1.5 rounded text-xs transition-colors"
                  >
                    {webFolder.folderName ? "Change Folder…" : "Select Reports Folder…"}
                  </button>
                  {webFolder.folderName && (
                    <button
                      onClick={webFolder.disconnect}
                      className="border border-border hover:border-danger text-text-muted hover:text-danger px-3 py-1.5 rounded text-xs transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Load Latest button */}
              {webFolder.folderName && !webFolder.needsPermission && (
                <button
                  onClick={webFolder.loadLatest}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors w-fit"
                >
                  {character || inventoryTimestamp ? "↻ Reload Latest" : "Load Latest"}
                </button>
              )}

              {/* Permission re-grant banner */}
              {webFolder.needsPermission && (
                <div className="flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gold font-medium">⚠</span>
                  <span className="text-text-primary text-xs">
                    Folder access expired — click to re-grant read permission.
                  </span>
                  <button
                    onClick={webFolder.requestPermission}
                    className="ml-auto bg-accent hover:bg-accent-hover text-white px-3 py-1 rounded text-xs transition-colors"
                  >
                    Grant Access
                  </button>
                </div>
              )}

              {/* Auto-watch toggle */}
              {webFolder.folderName && !webFolder.needsPermission && (
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
                  <div>
                    <div className="text-sm text-text-primary">Auto-watch</div>
                    <div className="text-xs text-text-muted">
                      {webFolder.watching
                        ? webFolder.watchStatus ?? "Watching for new exports…"
                        : "Automatically reload when new reports appear"}
                    </div>
                  </div>
                  <button
                    onClick={() => webFolder.setWatching(!webFolder.watching)}
                    role="switch"
                    aria-checked={webFolder.watching}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      webFolder.watching ? "bg-accent" : "bg-bg-primary border border-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        webFolder.watching ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Manual file upload — always available as fallback */}
          <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-sm">Upload Character & Inventory</h3>
            <p className="text-xs text-text-muted">
              Export your character and inventory from Project Gorgon (F1 → Reports → Export),
              then upload the JSON files here.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 cursor-pointer">
                <span className="text-xs text-text-muted">Character file (Character_*.json)</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const sheet = parseCharacterSheet(text);
                      importCharacter(sheet, text);
                      addStatus(`✓ Character loaded: ${sheet.Character} @ ${sheet.ServerName}`);
                    } catch (err) {
                      addStatus(`✗ Failed to parse character: ${err}`);
                    }
                    e.target.value = "";
                  }}
                />
                <span className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-sm text-center transition-colors">
                  {character ? "↻ Reload Character" : "Choose Character File"}
                </span>
              </label>

              <label className="flex flex-col gap-1 cursor-pointer">
                <span className="text-xs text-text-muted">Inventory file (*_items_*.json)</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const inv = parseInventory(text);
                      importInventory(inv, text);
                      addStatus(`✓ Inventory loaded: ${inv.Items.length} items for ${inv.Character}`);
                    } catch (err) {
                      addStatus(`✗ Failed to parse inventory: ${err}`);
                    }
                    e.target.value = "";
                  }}
                />
                <span className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-sm text-center transition-colors">
                  {inventoryTimestamp ? "↻ Reload Inventory" : "Choose Inventory File"}
                </span>
              </label>

              <label className="flex flex-col gap-1 cursor-pointer">
                <span className="text-xs text-text-muted">Gourmand eaten report (.txt from Books/)</span>
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const eaten = parseEatenFoods(text);
                      if (!eaten) {
                        addStatus("✗ No 'Foods Consumed' section found in file");
                        return;
                      }
                      importEatenFoods(eaten, text);
                      addStatus(`✓ Gourmand eaten data loaded: ${eaten.size} foods consumed`);
                    } catch (err) {
                      addStatus(`✗ Failed to parse eaten foods: ${err}`);
                    }
                    e.target.value = "";
                  }}
                />
                <span className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-sm text-center transition-colors">
                  {eatenFoods ? `↻ Reload Eaten (${eatenFoods.size})` : "Choose Eaten Foods File"}
                </span>
              </label>
            </div>
          </section>
        </>
      )}

      {/* Loaded Characters — manage imported character data */}
      {useAltStore.getState().alts.size > 0 && (
        <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Loaded Characters</h3>
          <div className="space-y-2">
            {Array.from(useAltStore.getState().alts.values()).map((alt) => (
              <div key={alt.id} className="flex items-center justify-between bg-bg-primary rounded p-2 border border-border">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">{alt.name} <span className="text-text-muted font-normal">@ {alt.server}</span></span>
                  <div className="flex gap-3 text-xs text-text-muted mt-0.5">
                    <span>{alt.inventoryTimestamp ? `Inv: ${new Date(alt.inventoryTimestamp).toLocaleDateString()}` : "No inventory"}</span>
                    <span>{alt.eatenFoods ? `Eaten: ${alt.eatenFoods.size} foods` : "No eaten data"}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!window.confirm(`Delete all data for ${alt.name} @ ${alt.server}?`)) return;
                    const id = alt.id;
                    useAltStore.getState().removeCharacter(id);
                    deleteUserFile(`character:${id}`).catch(() => {});
                    deleteUserFile(`inventory:${id}`).catch(() => {});
                    deleteUserFile(`eatenFoods:${id}`).catch(() => {});
                    addStatus(`✓ Deleted ${alt.name} @ ${alt.server}`);
                  }}
                  className="px-2 py-1 text-xs text-error hover:bg-error/10 rounded transition-colors"
                  title={`Delete ${alt.name} and all associated data`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Drag-and-drop fallback */}
      <section
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-accent transition-colors cursor-pointer"
      >
        <div className="text-2xl mb-1">📂</div>
        <p className="text-text-secondary text-sm font-medium">
          Drag & drop files here
        </p>
        <p className="text-text-muted text-xs mt-1">
          Character_*.json · *_items_*.json · Gourmand .txt · or any CDN JSON
        </p>
      </section>

      {/* Status log */}
      {status.length > 0 && (
        <section className="bg-bg-secondary rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-text-secondary">Log</h3>
            <button
              onClick={() => setStatus([])}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              Clear
            </button>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto font-mono">
            {status.map((msg, i) => (
              <p
                key={i}
                className={`text-xs ${
                  msg.startsWith("✓")
                    ? "text-success"
                    : msg.startsWith("✗")
                    ? "text-danger"
                    : "text-text-muted"
                }`}
              >
                {msg}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Custom tags */}
      <TagsSettingsSection />

      {/* Theme */}
      <section className="bg-bg-secondary rounded-lg p-4">
        <h3 className="font-medium text-sm mb-3">Appearance</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-muted">Theme</label>
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              applyTheme(e.target.value);
            }}
            className="bg-bg-primary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Current state */}
      <section className="bg-bg-secondary rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">
          Status
        </h3>
        <div className="space-y-2">
          <StatusRow
            label="Game Data"
            value={
              loaded
                ? cachedVersion
                  ? `Loaded (v${cachedVersion})`
                  : "Loaded"
                : "Not loaded"
            }
            ok={loaded}
          />
          <StatusRow
            label="Item Sources"
            value={sourcesLoaded ? "Loaded" : "Not loaded"}
            ok={sourcesLoaded}
          />
          <StatusRow
            label="Character"
            value={
              character
                ? `${character.Character} @ ${character.ServerName}`
                : "Not loaded"
            }
            ok={!!character}
          />
          <StatusRow
            label="Inventory"
            value={
              inventoryTimestamp
                ? new Date(inventoryTimestamp).toLocaleString()
                : "Not loaded"
            }
            ok={!!inventoryTimestamp}
          />
        </div>
      </section>
    </div>
  );
}

function FileProgressRow({ progress }: { progress: DownloadProgress }) {
  const icons: Record<DownloadProgress["status"], string> = {
    pending: "○",
    cached: "●",
    downloading: "⟳",
    done: "✓",
    error: "✗",
  };
  const colors: Record<DownloadProgress["status"], string> = {
    pending: "text-text-muted",
    cached: "text-accent",
    downloading: "text-gold",
    done: "text-success",
    error: "text-danger",
  };
  const labels: Record<DownloadProgress["status"], string> = {
    pending: "waiting",
    cached: "from cache",
    downloading: "downloading…",
    done: "downloaded",
    error: "error",
  };

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className={`${colors[progress.status]} w-4 text-center`}>
        {icons[progress.status]}
      </span>
      <span className="text-text-secondary w-40 truncate">{progress.filename}</span>
      <span className={colors[progress.status]}>
        {progress.error ? progress.error : labels[progress.status]}
      </span>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={ok ? "text-success" : "text-text-muted"}>{value}</span>
    </div>
  );
}
