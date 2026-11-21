# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Isometric Contributions Plus is the independent fork at https://github.com/vycdev/isometric-contributions-plus. It is a browser extension (Chrome/Brave, Firefox, Edge, Safari) that renders GitHub contribution graphs as isometric 3D pixel art using obelisk.js. Users choose any combination of the 3D isometric view, a line trend and GitHub's 2D calendar in the toolbar popup. Preserve upstream copyright and dependency notices; direct support and publishing configuration to this fork. See PUBLISHING.md for unconfigured store accounts and private reporting contact.

## Commands

- `pnpm install --frozen-lockfile` - Install with the version pinned in package.json
- `pnpm run build` - Build the extension with Parcel
- `pnpm run start` - Watch mode for development (serves from localhost)
- `pnpm test` - Run Biome, unit tests, and script tooling checks
- `pnpm run test:unit` - Run unit tests independently of formatting checks
- `pnpm run test:tooling` - Check pnpm subprocesses and browser build regressions
- `pnpm run test:publishing` - Check fork publisher identity and configuration guards
- Run helpers through their `pnpm run` scripts.

## Code Style

Uses Biome:
- No semicolons
- 2-space indentation
- ES modules (`"type": "module"` in package.json)

## Architecture

The extension is a content script that runs on `github.com/*` pages:

**src/iso.js** - Main extension logic:
- Detects GitHub profile pages via `.vcard-names-container`
- Uses MutationObserver to detect when contribution graph loads
- Scrapes contribution data from `.js-calendar-graph-table` DOM elements
- Calculates stats (total, streaks, best day, averages)
- Renders isometric cubes using obelisk.js onto a canvas
- Reads settings from `chrome.storage.local` and applies changes live through `storage.onChanged`

**src/line.js** - Line trend view: 28-day averages, the year-before comparison (shifted 52 weeks), summary stats and the SVG renderer with hover/keyboard tooltip

**src/years.js** - GitHub's year list: selected-year color (injected stylesheet, since GitHub rewrites the list's inline style) and the added "Past year" link

**src/history.js** - Fetches and caches earlier contribution years (streaks and the line comparison)

**src/settings.js** - Setting definitions and normalizers. `views` (array of `cubes`/`line`/`squares`) replaced the retired `toggleSetting`, which is still read for migration

**src/popup.js** - Toolbar popup: views, contribution color and scale

**src/iso.css** - Shows/hides views from the `.ic-views` + `.ic-view-*` classes on the contributions box

**src/obelisk.min.js** - Vendored isometric rendering library

**src/manifest.json** - Manifest v3 extension configuration
