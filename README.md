# Isometric Contributions Plus

[![Node.js CI status](https://img.shields.io/github/actions/workflow/status/vycdev/isometric-contributions-plus/nodejs.yml?label=CI)](https://github.com/vycdev/isometric-contributions-plus/actions/workflows/nodejs.yml) [![MIT license](https://img.shields.io/github/license/vycdev/isometric-contributions-plus)](LICENSE) [![Support on Patreon](https://img.shields.io/badge/Patreon-Support-orange?logo=patreon&logoColor=white)](https://www.patreon.com/cw/vycdev)

This is a browser extension for Chrome/Brave and Firefox that lets you toggle between your regular GitHub contribution chart and an isometric pixel art version. It uses [obelisk.js](https://github.com/nosir/obelisk.js) for the isometric graphics.

This independent fork is maintained at [vycdev/isometric-contributions-plus](https://github.com/vycdev/isometric-contributions-plus), based on [Jason Long's Isometric Contributions](https://github.com/jasonlong/isometric-contributions). [中文说明](README-zh.md).

Besides being sort of neat looking, this view is interesting in that it highlights the differences between the number of contributions with more granularity. This isn't meant to completely replace the standard 2D graph though, because in most ways it is actually less useful. For example, there are no axis labels, shorter bars can be hidden behind taller ones, you can't hover over a bar to see the day and count, etc.

<img src="img/preview.png" width="1052" />

The preview uses inherited artwork. Plus artwork and screenshots are being updated separately in [issue #1](https://github.com/vycdev/isometric-contributions-plus/issues/1).

## Contribution scale

Click the extension's toolbar icon to open its settings menu. Under **Contribution scale**, choose how 3D bar heights and 2D color intensity represent daily contributions:

- **Linear** (default): height and color intensity are proportional to contribution counts.
- **Square root**: gives everyday activity a moderate boost while keeping peaks distinct. A gentler adjustment than logarithmic scaling, with less crowding from tall neighboring bars.
- **Logarithmic**: reduces the visual impact of unusually busy days so everyday activity is easier to see.

Open GitHub charts update immediately in 2D, 3D, and Both modes when you change the setting. The selected scale is displayed beside the daily average and beneath the 2D legend. Your choice is saved across profiles, years, and page reloads. All three scales keep inactive days neutral and flat, and the busiest visible day at maximum intensity and height. Square-root and logarithmic heights and intensities are not proportional to counts. Calendar square sizes, dates, counts, tooltips, totals, averages, and streaks stay unchanged.

The 2D colors interpolate through the current palette; legend swatches represent 0%, 25%, 50%, 75%, and 100% of the selected intensity scale. For a 609-contribution peak, a 10-contribution day has about 1.6% Linear, 12.8% Square root, or 37.4% Logarithmic intensity. Empty years stay neutral; a year with one contribution gives that day maximum intensity.

### Palette integration

`contributionIntensity` in `src/utils.js` owns the normalization shared by height and intensity. `src/calendar.js` samples the five unscaled `.ContributionCalendar-day[data-level="0".."4"]` fill colors, then interpolates between adjacent stops. Theme and configurable-palette changes should supply those fill colors (including a neutral level 0) and trigger the existing chart refresh after applying the palette. The intensity renderer writes only `--ic-intensity-color` on dated squares; it preserves `data-level` so original colors can still be sampled for 3D. The blue identity (#1) and color settings (#2) can integrate here without changing the normalization or adding another scale preference. The existing `heightScale` storage key is retained for compatibility.

## Installation

**Plus has no verified Chrome, Firefox, Edge, or Safari store listing yet.** The original extension's store listings do not install this fork. Build locally until fork-owned listings are announced here. Any future packaged downloads belong on [this fork's Releases page](https://github.com/vycdev/isometric-contributions-plus/releases).

With Node.js 22 or 24 and pnpm 10.34.9 installed (see [Contributing](#contributing)):

```sh
git clone https://github.com/vycdev/isometric-contributions-plus.git
cd isometric-contributions-plus
pnpm install --frozen-lockfile
pnpm run build
```

- **Chrome/Brave/Edge:** open `chrome://extensions`, `brave://extensions`, or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`.
- **Firefox:** run `pnpm run build:firefox`, then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/manifest.json`. Temporary installations disappear when Firefox restarts. Packaging uses the local `web-ext` tool; no system `zip` command is required.
- **Safari:** `pnpm run build:safari --resources-only` generates the browser resources on any supported development platform. Building the native app requires macOS/Xcode; see [publishing configuration](PUBLISHING.md#safari).

Use the built `dist/` directory; source modules in `src/` need Parcel compilation. Reload the extension after rebuilding. The toolbar popup configures contribution scaling; this fork currently runs on `github.com`, without an Enterprise-domain enable menu.

## Contributing

Use Node.js 22 or 24 (`.nvmrc` selects 22) and **pnpm 10.34.9**, pinned in
`package.json`. With a current [Corepack](https://pnpm.io/10.x/installation#using-corepack)
installation, run `corepack enable pnpm`; Corepack reads the project pin. If
Corepack is unavailable, bootstrap pnpm once with `npm install --global pnpm@10.34.9`.
Then run:

```sh
pnpm --version
pnpm install --frozen-lockfile
pnpm test
pnpm run build
```

On Windows, clone with `git -c core.autocrlf=false clone https://github.com/vycdev/isometric-contributions-plus.git` so
checkout preserves the LF line endings expected by Biome. The Windows CI jobs
also preserve LF during checkout; existing CRLF checkouts may need their line
endings corrected before the full formatting check passes.

Commit `pnpm-lock.yaml` when dependencies change. It was imported from the npm
lockfile to retain existing resolutions. Dependabot intentionally uses its `npm`
ecosystem setting, which also supports pnpm's v9 lockfile. Overrides and install
script decisions live in `pnpm-workspace.yaml`. Parcel's native dependencies and
Puppeteer's browser download are approved there; new install scripts require an
explicit decision (`pnpm approve-builds`) before a clean install succeeds.

Useful contributor commands:

- `pnpm run start`: watch the extension during development.
- `pnpm run test:unit` / `pnpm run test:tooling` / `pnpm run test:publishing`: run unit, tooling, or fork publishing checks independently.
- `pnpm run test:e2e`: ensure Puppeteer's pinned Chrome is downloaded, build the extension, and run the live GitHub health check. The browser download is checked explicitly because a restored pnpm store can skip install scripts without restoring Puppeteer's separate cache.
- `pnpm run build:all`: create Chrome, Edge, and Firefox ZIPs in `artifacts/` using the local `web-ext` tool; no system `zip` command is required.
- `pnpm run build:safari --resources-only`: build and sync Safari resources on any platform.
- `pnpm run build:safari` / `pnpm run build:safari:release`: also build the macOS app (requires macOS and Xcode).
- `pnpm run version:get` / `pnpm run version:patch`: inspect or bump extension and Safari versions; minor, major, and `pnpm run version:set X.Y.Z` variants are also available.
- `pnpm run submit:chrome`, `pnpm run submit:edge`, `pnpm run submit:firefox`, and `pnpm run release`: publish using the configured store credentials.

Run script helpers through their `pnpm run` commands so child processes reuse
the pinned pnpm CLI on Windows, macOS, and Linux, including standalone pnpm
installations. Local tools use `pnpm exec` and do not download an unpinned CLI. `web-ext` is declared
directly because Firefox submission and ZIP packaging use its executable.
`pnpm run submit:dry-run` checks configuration and artifacts offline. It never
authenticates or uploads. See [PUBLISHING.md](PUBLISHING.md) before configuring store accounts.

Report bugs, ask support questions, and discuss contributions in [this fork's issues](https://github.com/vycdev/isometric-contributions-plus/issues). Use `pnpm run start` for watch mode, `pnpm run test:unit` for unit tests, and `pnpm test` for formatting, lint, and unit checks. See [PUBLISHING.md](PUBLISHING.md) for pending store-account and private-contact setup. Never use upstream publisher accounts for this fork.

## Related projects

- [Qiuner's separate isometric-contributions-plus fork](https://github.com/Qiuner/isometric-contributions-plus) - GitCode integration and additional features; maintained independently of this repository.

## License

This project is licensed under the [MIT License](LICENSE). Original copyright and dependency notices are preserved.
