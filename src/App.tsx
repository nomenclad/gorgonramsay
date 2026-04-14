/**
 * Root application component.
 *
 * On mount: restores the saved theme from localStorage and hydrates all cached
 * game/character data from IndexedDB. Renders a tab-based UI where all tabs are
 * mounted simultaneously but hidden via CSS — this keeps each tab's React state
 * alive across tab switches (no re-mount flicker).
 *
 * How to add a new tab:
 *   1. Add an entry to DEFAULT_TABS below.
 *   2. Import the component and add a `<div className={...}>` in the JSX.
 *   3. If the tab needs full-height layout (no scroll wrapper), add its ID to fullHeightTabs.
 */
import { useEffect, useState } from "react";
import "./index.css";
import { hydrateFromCache } from "./lib/hydrate";
import { Header } from "./components/layout/Header";
import { TabBar } from "./components/layout/TabBar";
import { Footer } from "./components/layout/Footer";
import { InventoryBrowser } from "./components/inventory/InventoryBrowser";
import { RecipeBrowser } from "./components/recipes/RecipeBrowser";
import { GourmandTracker } from "./components/gourmand/GourmandTracker";
import { CraftingCalculator } from "./components/crafting/CraftingCalculator";
import { SettingsPage } from "./components/import/SettingsPage";
import { CookingPlannerPage } from "./components/planner/CookingPlanner";
import { ChangelogPage } from "./components/changelog/ChangelogPage";
import { useNavStore } from "./stores/navStore";
import type { Tab } from "./components/layout/TabBar";

const fullHeightTabs = new Set(["crafting"]);

const DEFAULT_TABS: Tab[] = [
  { id: "inventory", label: "Ingredients" },
  { id: "recipes",   label: "Recipes" },
  { id: "gourmand",  label: "Gourmand" },
  { id: "planner",   label: "Planner" },
  { id: "crafting",  label: "Crafting" },
  { id: "changelog", label: "Changelog" },
  { id: "settings",  label: "Settings" },
];

function loadTabOrder(): Tab[] {
  try {
    const saved = localStorage.getItem("tabOrder");
    if (saved) {
      const ids: string[] = JSON.parse(saved);
      // If saved set doesn't match current defaults (tabs added/removed), reset to defaults
      const savedSet = new Set(ids);
      const defaultSet = new Set(DEFAULT_TABS.map((t) => t.id));
      if (savedSet.size !== defaultSet.size || [...defaultSet].some((id) => !savedSet.has(id))) {
        localStorage.removeItem("tabOrder");
        return DEFAULT_TABS;
      }
      const map = new Map(DEFAULT_TABS.map((t) => [t.id, t]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as Tab[];
      return ordered;
    }
  } catch (e) { console.warn("Failed to load saved tab order:", e); }
  return DEFAULT_TABS;
}

function App() {
  const activeTab = useNavStore((s) => s.activeTab);
  const setActiveTab = useNavStore((s) => s.setActiveTab);
  const [hydrated, setHydrated] = useState(false);

  // Restore theme + all cached data from IndexedDB on mount
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved && saved !== "default") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    hydrateFromCache().finally(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-screen text-text-muted text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      <TabBar
        defaultTabs={DEFAULT_TABS}
        loadTabOrder={loadTabOrder}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Tab content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Full-height tabs */}
          <div className={`flex flex-1 min-h-0 overflow-hidden ${activeTab !== "crafting" ? "hidden" : ""}`}>
            <CraftingCalculator />
          </div>

          {/* Scrollable tabs */}
          <div className={`flex-1 overflow-y-auto p-4 ${fullHeightTabs.has(activeTab) ? "hidden" : ""}`}>
            <div className="w-full">
              <div className={activeTab !== "inventory" ? "hidden" : ""}><InventoryBrowser /></div>
              <div className={activeTab !== "recipes"   ? "hidden" : ""}><RecipeBrowser /></div>
              <div className={activeTab !== "gourmand"  ? "hidden" : ""}><GourmandTracker /></div>
              <div className={activeTab !== "planner"   ? "hidden" : ""}><CookingPlannerPage /></div>
              <div className={activeTab !== "changelog" ? "hidden" : ""}><ChangelogPage /></div>
              <div className={activeTab !== "settings"  ? "hidden" : ""}><SettingsPage /></div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default App;
