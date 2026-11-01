# Isometric Contributions Plus

![Node.js CI](https://github.com/vycdev/isometric-contributions-plus/workflows/Node.js%20CI/badge.svg)
[![Biome code style](https://img.shields.io/badge/code_style-Biome-60a5fa.svg)](https://biomejs.dev)

This is a browser extension for Chrome/Brave and Firefox that lets you toggle between your regular GitHub contribution chart and an isometric pixel art version. It uses [obelisk.js](https://github.com/nosir/obelisk.js) for the isometric graphics.

This independent fork of [Jason Long's Isometric Contributions](https://github.com/jasonlong/isometric-contributions) uses blue by default across the 2D calendar, isometric graph, legends, statistics, and settings. Inactive days remain neutral. Light and dark palettes follow GitHub's appearance setting; the toolbar menu follows your system appearance.

Besides being sort of neat looking, this view is interesting in that it highlights the differences between the number of contributions with more granularity. This isn't meant to completely replace the standard 2D graph though, because in most ways it is actually less useful. For example, there are no axis labels, shorter bars can be hidden behind taller ones, you can't hover over a bar to see the day and count, etc.

<img src="img/preview.png" width="1052" />

<img src="img/preview-dark.png" width="1052" />

Screenshots use sample contribution data. Both views retain GitHub's activity levels; changing the height scale changes only the 3D bar heights.

## Height scale

Click the extension's toolbar icon to open its settings menu. Under **Height scale**, choose how bar heights represent daily contributions:

- **Linear** (default): heights are proportional to contribution counts.
- **Square root**: gives everyday activity a moderate boost while keeping peaks distinct. A gentler adjustment than logarithmic scaling, with less crowding from tall neighboring bars.
- **Logarithmic**: reduces the visual impact of unusually busy days so everyday activity is easier to see.

Open GitHub charts update immediately when you change the setting. The selected scale is displayed beside the daily average beneath the contribution statistics. Your choice is saved across profiles, years, and page reloads. All three scales keep inactive days flat and the busiest day at the maximum height. Square-root and logarithmic heights are not proportional to counts. Contribution counts, statistics, and the 2D activity levels stay unchanged.

<img src="img/settings-light.png" width="328" alt="Blue settings menu in light mode" />
<img src="img/settings-dark.png" width="328" alt="Blue settings menu in dark mode" />

## Installation

The original extension's store listings distribute the original project. To try **Isometric Contributions Plus**, build this fork locally:

```sh
npm ci
npm run build
```

In Chrome, Brave, or Edge, open the Extensions page, enable **Developer mode**, click **Load unpacked**, and select the generated `dist` directory. For Firefox packaging, run `npm run build:firefox`. On macOS, `npm run build:safari` builds the Safari app using Xcode.

## Contributing

Use this fork's [issue tracker](https://github.com/vycdev/isometric-contributions-plus/issues) for changes to Isometric Contributions Plus. Build and load the extension as described above.

<img src="img/dev-mode.png" width="981" />

After changes, rebuild, then click **Reload** under the extension entry. Refresh open GitHub pages to reload the content script.

<img src="img/reload-link.png" width="410" />

### Theme and artwork

Shared light/dark palette tokens live in [`src/theme.css`](src/theme.css). See [`scripts/artwork/README.md`](scripts/artwork/README.md) for the color/scaling integration contract and the reproducible icon, screenshot, and visual-check workflow.

## Community Forks

- [isometric-contributions-plus](https://github.com/Qiuner/isometric-contributions-plus) - Extended version with GitCode integration and additional features

## License

This project is licensed under the [MIT License](http://opensource.org/licenses/MIT).
