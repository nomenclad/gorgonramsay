# GorgonRamsay

A food-crafting companion app for [Project Gorgon](https://projectgorgon.com). Browse recipes, track Gourmand progress, plan crafting chains, and optimize food skill leveling — all powered by live game data from the CDN.

Available as a **Tauri desktop app** (Windows/Mac/Linux) and a **web version** hosted on [GitHub Pages](https://nomenclad.github.io/gorgonramsay/).

## Features

- **Recipe Browser** — Search and filter recipes across all food skills with source info (trainers, scrolls, quests, drops)
- **Ingredient Tracker** — Import your inventory and see what you have, what you need, and where to get it
- **Gourmand Tracker** — Track which foods you've eaten for first-time XP bonuses, with crafting feasibility checks
- **Cooking Planner** — Queue recipes, calculate raw material totals, and generate gathering routes by zone
- **Crafting Calculator** — Interactive dependency tree visualization for multi-step crafting chains
- **Skill Optimizer** — Compute optimal recipe sequences to reach target skill levels, accounting for XP dropoff

## Getting Started

### Web

Visit [nomenclad.github.io/gorgonramsay](https://nomenclad.github.io/gorgonramsay/) — no install needed. Game data is bundled at build time.

### Desktop (Tauri)

```bash
npm install
npm run tauri dev
```

### Web Dev Server

```bash
npm install
npm run dev:web
```

The dev server includes a proxy for the CDN version endpoint to avoid mixed-content issues.

## Project Structure

```
gorgonramsay/
├── .claude/              # Claude Code configuration
├── .github/workflows/    # GitHub Actions CI — builds and deploys to GitHub Pages
├── public/               # Static assets (favicon, SVG icons, monster drop data)
├── scripts/              # Build-time utilities (CDN data fetcher, wiki drop scraper)
├── src/                  # React application source
│   ├── components/       # UI components organized by feature
│   │   ├── common/       #   Reusable UI (tooltips, icons, pagination, resizable tables)
│   │   ├── crafting/     #   Interactive crafting dependency tree
│   │   ├── gold/         #   Gold efficiency analysis
│   │   ├── gourmand/     #   Food tracking and Gourmand planner
│   │   ├── import/       #   Settings page and data import
│   │   ├── inventory/    #   Ingredient browser and detail modals
│   │   ├── layout/       #   App shell (header, tab bar, footer)
│   │   ├── optimizer/    #   Skill leveling guides
│   │   ├── planner/      #   Multi-tab cooking planner (storage, gardening, foraging, routes)
│   │   └── recipes/      #   Recipe browser and tracker
│   ├── hooks/            # Custom React hooks (column filters, resizable columns, quick cook)
│   ├── lib/              # Core logic — CDN loading, recipe/ingredient resolution, XP math
│   │   └── parsers/      #   Transforms raw CDN JSON into app-usable structures
│   ├── stores/           # Zustand state (game data, inventory, character, planner, navigation)
│   ├── types/            # TypeScript type definitions for game data models
│   └── workers/          # Web Workers for off-thread optimization calculations
├── src-tauri/            # Tauri (Rust) backend — CDN fetching, desktop window, native dialogs
├── eslint.config.js      # ESLint configuration
├── index.html            # Vite HTML entry point
├── package.json          # Dependencies and build scripts
├── tsconfig.json         # TypeScript project references root
├── tsconfig.app.json     # TypeScript config for the React app
├── tsconfig.node.json    # TypeScript config for Vite/Node tooling
└── vite.config.ts        # Vite config — build targets, dev proxy, Tailwind, base path
```

## Build Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Tauri desktop dev server |
| `npm run dev:web` | Start web-only dev server (port 5175) |
| `npm run build` | Production build for Tauri desktop |
| `npm run build:web` | Production build for web (output: `dist-web/`) |
| `npm run tauri dev` | Launch Tauri app in development mode |

## Data Sources

- **Project Gorgon CDN** — Live game data (recipes, items, XP tables, NPC info, item sources)
- **Character Exports** — Import your character sheet to load inventory, skills, and recipe completions
- **Wiki Scraping** — `scripts/scrape_wiki_drops.mjs` builds `public/monster_drops.json` from the Project Gorgon wiki

## Tech Stack

[React 19](https://react.dev) | [TypeScript](https://typescriptlang.org) | [Vite](https://vite.dev) | [Tauri 2](https://tauri.app) | [Tailwind CSS](https://tailwindcss.com) | [Zustand](https://zustand.docs.pmnd.rs) | [Dexie](https://dexie.org) | [TanStack Table](https://tanstack.com/table) | [Recharts](https://recharts.org)
