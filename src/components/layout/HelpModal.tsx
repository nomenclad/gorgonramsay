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
              game data from the CDN, then import your character JSON file exported from
              the game. This populates your inventory, known recipes, and skill levels.
            </p>
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
              <li>Re-import your character file after playing to keep inventory up to date.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
