# Isometric Contributions Plus

[![Node.js CI](https://github.com/vycdev/isometric-contributions-plus/actions/workflows/nodejs.yml/badge.svg)](https://github.com/vycdev/isometric-contributions-plus/actions/workflows/nodejs.yml)
[![Biome code style](https://img.shields.io/badge/code_style-Biome-60a5fa.svg)](https://biomejs.dev)

This is a browser extension for Chrome/Brave and Firefox that lets you toggle between your regular GitHub contribution chart and an isometric pixel art version. It uses [obelisk.js](https://github.com/nosir/obelisk.js) for the isometric graphics.

This independent fork is maintained at [vycdev/isometric-contributions-plus](https://github.com/vycdev/isometric-contributions-plus), based on [Jason Long's Isometric Contributions](https://github.com/jasonlong/isometric-contributions). [中文说明](README-zh.md).

Besides being sort of neat looking, this view is interesting in that it highlights the differences between the number of contributions with more granularity. This isn't meant to completely replace the standard 2D graph though, because in most ways it is actually less useful. For example, there are no axis labels, shorter bars can be hidden behind taller ones, you can't hover over a bar to see the day and count, etc.

<img src="img/preview.png" width="1052" />

The preview uses inherited artwork. Plus artwork and screenshots are being updated separately in [issue #1](https://github.com/vycdev/isometric-contributions-plus/issues/1).

## Height scale

Click the extension's toolbar icon to open its settings menu. Under **Height scale**, choose how bar heights represent daily contributions:

- **Linear** (default): heights are proportional to contribution counts.
- **Square root**: gives everyday activity a moderate boost while keeping peaks distinct. A gentler adjustment than logarithmic scaling, with less crowding from tall neighboring bars.
- **Logarithmic**: reduces the visual impact of unusually busy days so everyday activity is easier to see.

Open GitHub charts update immediately when you change the setting. The selected scale is displayed beside the daily average beneath the contribution statistics. Your choice is saved across profiles, years, and page reloads. All three scales keep inactive days flat and the busiest day at the maximum height. Square-root and logarithmic heights are not proportional to counts. Contribution counts, statistics, and GitHub's square colors stay unchanged.

## Installation

**Plus has no verified Chrome, Firefox, Edge, or Safari store listing yet.** The original extension's store listings do not install this fork. Build locally until fork-owned listings are announced here. Any future packaged downloads belong on [this fork's Releases page](https://github.com/vycdev/isometric-contributions-plus/releases).

With Node.js 22 or newer and npm installed:

```sh
git clone https://github.com/vycdev/isometric-contributions-plus.git
cd isometric-contributions-plus
npm ci
npm run build
```

- **Chrome/Brave/Edge:** open `chrome://extensions`, `brave://extensions`, or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`.
- **Firefox:** run `npm run build:firefox`, then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/manifest.json`. Temporary installations disappear when Firefox restarts. ZIP packaging currently needs the `zip` command; [issue #4](https://github.com/vycdev/isometric-contributions-plus/issues/4) covers portable tooling.
- **Safari:** `npm run build:safari -- --resources-only` generates the browser resources on any supported development platform. Building the native app requires macOS/Xcode; see [publishing configuration](PUBLISHING.md#safari).

Use the built `dist/` directory; source modules in `src/` need Parcel compilation. Reload the extension after rebuilding. The toolbar popup configures height scaling; this fork currently runs on `github.com`, without an Enterprise-domain enable menu.

## Contributing

Report bugs, ask support questions, and discuss contributions in [this fork's issues](https://github.com/vycdev/isometric-contributions-plus/issues). Use `npm run start` for watch mode, `npx vitest run` for unit tests, and `npm test` for formatting, lint, and unit checks. See [PUBLISHING.md](PUBLISHING.md) for pending store-account and private-contact setup. Never use upstream publisher accounts for this fork.

## Related projects

- [Qiuner's separate isometric-contributions-plus fork](https://github.com/Qiuner/isometric-contributions-plus) - GitCode integration and additional features; maintained independently of this repository.

## License

This project is licensed under the [MIT License](LICENSE). Original copyright and dependency notices are preserved.
