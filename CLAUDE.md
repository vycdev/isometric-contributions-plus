# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Isometric Contributions Plus is the independent fork at https://github.com/vycdev/isometric-contributions-plus. It is a browser extension (Chrome/Brave, Firefox, Edge, Safari) that renders GitHub contribution graphs as isometric 3D pixel art using obelisk.js. Users can toggle between the standard 2D view and the isometric 3D view. Preserve upstream copyright and dependency notices; direct support and publishing configuration to this fork. See PUBLISHING.md for unconfigured store accounts and private reporting contact.

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
- Persists user view preference (2D/3D toggle) via `chrome.storage.local`

**src/iso.css** - Toggles visibility between 2D graph and 3D canvas based on `.ic-squares`/`.ic-cubes` classes

**src/obelisk.min.js** - Vendored isometric rendering library

**src/manifest.json** - Manifest v3 extension configuration
