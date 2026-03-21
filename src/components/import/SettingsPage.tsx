import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import {
  parseRecipes,
  buildRecipeIndexes,
} from "../../lib/parsers/recipeParser";
import { parseItems, buildItemIndexes } from "../../lib/parsers/itemParser";
import { parseCharacterSheet } from "../../lib/parsers/characterParser";
import { parseInventory } from "../../lib/parsers/inventoryParser";
import { parseXpTables } from "../../lib/parsers/xpTableParser";
import { parseSourcesData, parseNpcNames } from "../../lib/parsers/sourceParser";
import {
  loadAllCdnFiles,
  ALL_CDN_FILES,
  type DownloadProgress,
  type CdnFilename,
} from "../../lib/cdnLoader";
import { getCachedVersion } from "../../lib/db";

interface ReportFile {
  filename: string;
  path: string;
  modified_timestamp: number;
  file_type: string;
}

export function SettingsPage() {
  const setRecipes = useGameDataStore((s) => s.setRecipes);
  const setItems = useGameDataStore((s) => s.setItems);
  const setXpTables = useGameDataStore((s) => s.setXpTables);
  const setSources = useGameDataStore((s) => s.setSources);
  const setNpcNames = useGameDataStore((s) => s.setNpcNames);
  const setLoading = useGameDataStore((s) => s.setLoading);
  const loading = useGameDataStore((s) => s.loading);
  const loaded = useGameDataStore((s) => s.loaded);
  const sourcesLoaded = useGameDataStore((s) => s.sourcesLoaded);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
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

  const addStatus = useCallback(
    (msg: string) => setStatus((prev) => [...prev, msg]),
    []
  );

  // Load cached version on mount
  useEffect(() => {
    getCachedVersion().then((v) => setCachedVersion_(v));
  }, []);

  // Detect PG install path on mount
  useEffect(() => {
    (async () => {
      try {
        const pg = await invoke<string | null>("detect_pg_path");
        setPgPath(pg);
        if (pg) {
          const files = await invoke<ReportFile[]>("list_report_files", {
            reportsPath: pg,
          });
          setReportFiles(files);
        }
      } catch {
        // silent — user can drag-drop manually
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
      if (files["npcs.json"]) {
        const npcMap = parseNpcNames(files["npcs.json"]);
        setNpcNames(npcMap);
        addStatus(`✓ ${npcMap.size} NPCs loaded`);
      }
    },
    [setRecipes, setItems, setXpTables, setSources, setNpcNames, addStatus]
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
    const charFile = reportFiles.find((f) => f.file_type === "character");
    if (!charFile) {
      addStatus("No character file found");
      return;
    }
    try {
      const json = await invoke<string>("read_file_content", {
        path: charFile.path,
      });
      const sheet = parseCharacterSheet(json);
      setCharacter(sheet);
      addStatus(
        `✓ Character loaded: ${sheet.Character} @ ${sheet.ServerName} — ${
          Object.keys(sheet.Skills).length
        } skills`
      );
    } catch (e) {
      addStatus(`✗ Error loading character: ${e}`);
    }
  }, [reportFiles, addStatus, setCharacter]);

  const loadInventory = useCallback(async () => {
    const invFiles = reportFiles
      .filter((f) => f.file_type === "inventory")
      .sort((a, b) => b.modified_timestamp - a.modified_timestamp);
    if (invFiles.length === 0) {
      addStatus("No inventory files found");
      return;
    }
    try {
      const json = await invoke<string>("read_file_content", {
        path: invFiles[0].path,
      });
      const inv = parseInventory(json);
      setInventory(inv.Items, inv.Timestamp, inv.Character);
      addStatus(
        `✓ Inventory loaded: ${inv.Items.length} items from "${invFiles[0].filename}"`
      );
    } catch (e) {
      addStatus(`✗ Error loading inventory: ${e}`);
    }
  }, [reportFiles, addStatus, setInventory]);

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
          setCharacter(sheet);
          addStatus(`✓ Character loaded: ${sheet.Character} (drag-drop)`);
        } else if (file.name.includes("_items_")) {
          const inv = parseInventory(text);
          setInventory(inv.Items, inv.Timestamp, inv.Character);
          addStatus(`✓ ${inv.Items.length} inventory items loaded (drag-drop)`);
        } else {
          addStatus(`? Unrecognized file: ${file.name}`);
        }
      }
    },
    [addStatus, setRecipes, setItems, setXpTables, setSources, setNpcNames, setCharacter, setInventory]
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
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
        <p className="text-xs text-text-muted">
          {pgPath
            ? `Auto-detected PG install at: ${pgPath}`
            : "PG install not auto-detected — drag your character and inventory files below."}
        </p>
        {reportFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {reportFiles.some((f) => f.file_type === "character") && (
              <button
                onClick={loadCharacter}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {character ? "↻ Reload Character" : "Load Character"}
              </button>
            )}
            {reportFiles.some((f) => f.file_type === "inventory") && (
              <button
                onClick={loadInventory}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {inventoryTimestamp ? "↻ Reload Inventory" : "Load Latest Inventory"}
              </button>
            )}
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
      </section>

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
          Character_*.json · *_items_*.json · or any CDN JSON as override
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
