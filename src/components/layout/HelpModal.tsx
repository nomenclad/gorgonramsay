/**
 * Help/info modal explaining app features: getting started, tab descriptions,
 * quick actions, and general usage tips. Rendered as a portal overlay.
 * Closes on backdrop click or Escape key.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  onClose: () => void;
}

export function HelpModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">
            Help &mdash; Gorgon Ramsay
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 text-sm text-text-secondary space-y-4">
          <section>
            <h3 className="text-text-primary font-semibold mb-1">Getting Started</h3>
            <p>
              Gorgon Ramsay is a cooking companion for Project: Gorgon. To begin, go to
              the <span className="text-accent font-medium">Settings</span> tab, load the
              game data from the CDN, then import your character and inventory files. For
              accurate Gourmand eaten tracking, also import your Gourmand report file.
            </p>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Importing Your Data</h3>
            <p className="mb-2">
              Three files can be imported. You can upload them via the buttons in Settings or
              drag-and-drop them onto the drop zone at the bottom of the page.
            </p>

            <div className="space-y-3">
              <div>
                <p className="text-text-primary font-medium">1. Character File (required)</p>
                <p className="mt-0.5">
                  In-game, press <span className="text-accent">F1 &rarr; Reports &rarr; Export Character</span>.
                  This creates a JSON file with your skills, known recipes, and favor data.
                </p>
                <div className="mt-1 bg-bg-secondary rounded p-2 text-xs font-mono text-text-muted space-y-0.5">
                  <p className="text-text-secondary font-sans text-xs font-medium mb-0.5">File locations:</p>
                  <p><span className="text-accent">Mac:</span> ~/Library/Application Support/unity.Elder Game.Project Gorgon/</p>
                  <p><span className="text-accent">Windows:</span> %APPDATA%\..\LocalLow\Elder Game\Project Gorgon\</p>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Filename pattern: <span className="font-mono">Character_YourName_ServerName.json</span>
                </p>
              </div>

              <div>
                <p className="text-text-primary font-medium">2. Inventory / Storage File (required)</p>
                <p className="mt-0.5">
                  In-game, press <span className="text-accent">F1 &rarr; Reports &rarr; Export Storage</span>.
                  This creates a JSON file listing every item across all your storage vaults.
                </p>
                <div className="mt-1 bg-bg-secondary rounded p-2 text-xs font-mono text-text-muted space-y-0.5">
                  <p className="text-text-secondary font-sans text-xs font-medium mb-0.5">File locations:</p>
                  <p><span className="text-accent">Mac:</span> ~/Library/Application Support/unity.Elder Game.Project Gorgon/</p>
                  <p><span className="text-accent">Windows:</span> %APPDATA%\..\LocalLow\Elder Game\Project Gorgon\</p>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Filename pattern: <span className="font-mono">YourName_ServerName_items_timestamp.json</span>
                </p>
              </div>

              <div>
                <p className="text-text-primary font-medium">3. Gourmand Eaten Report (optional but recommended)</p>
                <p className="mt-0.5">
                  This is a <span className="font-mono">.txt</span> file the game writes automatically to
                  a <span className="font-mono">Books/</span> subfolder. It lists every food you&apos;ve
                  eaten for Gourmand XP &mdash; including raw foods like Large Strawberry that
                  can&apos;t be tracked from the character export. Without this file, the Eaten
                  column uses crafting data as an estimate.
                </p>
                <div className="mt-1 bg-bg-secondary rounded p-2 text-xs font-mono text-text-muted space-y-0.5">
                  <p className="text-text-secondary font-sans text-xs font-medium mb-0.5">File locations:</p>
                  <p><span className="text-accent">Mac:</span> ~/Library/Application Support/unity.Elder Game.Project Gorgon/Books/</p>
                  <p><span className="text-accent">Windows:</span> %APPDATA%\..\LocalLow\Elder Game\Project Gorgon\Books\</p>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Look for a <span className="font-mono">.txt</span> file containing
                  a &ldquo;Foods Consumed:&rdquo; section. The filename varies by character.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Ingredients</h3>
            <p>
              Browse all cooking ingredients from your inventory. Filter
              by <span className="text-accent">Have</span>, <span className="text-accent">Missing</span>,
              or acquisition type (Foraged / Crafted). Click any ingredient to see where
              it drops, which recipes use it, and your current stock across storage vaults.
            </p>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Recipes</h3>
            <p>
              View all food recipes in the game. Search and filter by skill, level, and
              ingredients. Right-click a recipe to add it to your cooking plan, look it up
              on the wiki, or jump to its ingredients.
            </p>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Gourmand</h3>
            <p>
              Track your Gourmand leveling progress. See which foods you still need to eat,
              sorted by the XP they grant. Foods are grouped by meal and snack slots so you
              can plan your next cook efficiently.
            </p>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Planner</h3>
            <p>
              The Cooking Planner turns queued recipes into a step-by-step plan. It breaks
              everything down into:
            </p>
            <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
              <li><span className="text-accent">Storage</span> &mdash; items to pull from your vaults</li>
              <li><span className="text-accent">Gardening</span> &mdash; seeds to plant</li>
              <li><span className="text-accent">Foraging</span> &mdash; ingredients to gather in the world</li>
              <li><span className="text-accent">Purchasing</span> &mdash; items to buy from NPC vendors</li>
              <li><span className="text-accent">Cooking</span> &mdash; the recipes to cook, in order</li>
              <li><span className="text-accent">Route</span> &mdash; an optimized route through zones</li>
            </ul>
            <p className="mt-1">
              Set your Gardening Zone and Cooking Zone to get vendor recommendations
              tailored to your preferred areas.
            </p>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Crafting</h3>
            <p>
              The Crafting Calculator helps you figure out the full material tree for any
              craftable item. Enter the item you want to craft and it will recursively
              resolve every sub-component, showing what you need to gather, buy, or craft.
            </p>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Quick Actions</h3>
            <ul className="list-disc list-inside ml-2 space-y-0.5">
              <li>
                <span className="text-accent">Quick Cook</span> &mdash; instantly queues the
                best Gourmand meal and snack you can cook right now with your current
                inventory, and opens the Planner.
              </li>
              <li>
                <span className="text-accent">Recipe Hunter</span> &mdash; finds recipes
                you haven&apos;t cooked yet that you&apos;re closest to being able to make.
              </li>
              <li>
                <span className="text-accent">Plan Cooking</span> &mdash; jumps to the
                Planner tab. The badge shows how many recipes are currently queued.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-text-primary font-semibold mb-1">Tips</h3>
            <ul className="list-disc list-inside ml-2 space-y-0.5">
              <li>Right-click items and recipes for context menus with extra actions.</li>
              <li>Tabs can be reordered &mdash; click the lock icon on the right side of the tab bar.</li>
              <li>Multiple themes are available in Settings.</li>
              <li>Re-import your character and inventory files after playing to keep data up to date.</li>
              <li>Re-import the Gourmand eaten report after eating new foods to update the Eaten column.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
