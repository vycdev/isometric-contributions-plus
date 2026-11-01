# Isometric Contributions Plus

[英文版](README.md) | 中文版

[![Node.js CI 状态](https://img.shields.io/github/actions/workflow/status/vycdev/isometric-contributions-plus/nodejs.yml?label=CI)](https://github.com/vycdev/isometric-contributions-plus/actions/workflows/nodejs.yml) [![MIT 许可证](https://img.shields.io/github/license/vycdev/isometric-contributions-plus)](LICENSE) [![通过 Patreon 支持](https://img.shields.io/badge/Patreon-Support-orange?logo=patreon&logoColor=white)](https://www.patreon.com/cw/vycdev)

这是 [Jason Long 的 Isometric Contributions](https://github.com/jasonlong/isometric-contributions) 的独立分支。它使用 [obelisk.js](https://github.com/nosir/obelisk.js) 将 GitHub 贡献日历绘制为立体像素图，支持 2D、3D 及同时显示两种视图。

默认蓝色主题覆盖日历、立体图、图例、统计与设置。无活动的日期保持中性色。图表配色跟随 GitHub 的外观设置，工具栏菜单跟随系统外观。以下截图使用示例数据。

<img src="img/preview.png" width="1052" alt="浅色蓝色贡献图" />

<img src="img/preview-dark.png" width="1052" alt="深色蓝色贡献图" />

立体图可以展示贡献数量之间的细微差异，但也有局限：没有坐标轴标签，较高的柱子可能遮挡较矮的柱子，且无法悬停查看日期和数量。需要这些信息时，可切换到 2D 或同时显示两种视图。

## 贡献缩放

点击扩展的工具栏图标，在 Contribution scale 中选择 3D 柱高与 2D 颜色强度的缩放方式：

- **Linear（线性，默认）**：柱高与颜色强度均与每日贡献数量成正比。
- **Square root（平方根）**：适度提升日常活动的可见度，同时保留峰值差异。
- **Logarithmic（对数）**：进一步降低异常峰值的视觉影响，使较少的日常活动更容易辨识。

设置会自动保存，跨个人主页、年份和页面刷新生效，并立即更新 2D、3D 与同时显示模式。当前缩放方式显示在每日平均值旁边与 2D 图例下方。缩放改变 3D 柱高与 2D 颜色强度；日历方块尺寸、日期、贡献数量、提示信息与统计数据保持不变。无活动的日期保持中性色，最繁忙的可见日期达到最大强度。

<img src="img/settings-light.png" width="328" alt="浅色设置菜单" />
<img src="img/settings-dark.png" width="328" alt="深色设置菜单" />

## 安装方式

原扩展的商店页面提供的是原项目。要体验 **Isometric Contributions Plus**，请从本仓库构建：

```sh
pnpm install --frozen-lockfile
pnpm run build
```

在 Chrome、Brave 或 Edge 的扩展页面启用**开发者模式**，点击**加载已解压的扩展程序**，选择生成的 `dist` 目录。Firefox 打包使用 `pnpm run build:firefox`。Safari 构建使用 `pnpm run build:safari`，需要 macOS 与 Xcode。

<img src="img/dev-mode.png" width="981" alt="启用开发者模式并加载扩展" />

## 贡献

请在本分支的[问题追踪器](https://github.com/vycdev/isometric-contributions-plus/issues)中讨论更改。修改代码后重新构建，在扩展页面点击**重新加载**，然后刷新 GitHub 页面。

<img src="img/reload-link.png" width="410" alt="重新加载扩展" />

共享配色位于 [`src/theme.css`](src/theme.css)。图标、截图的生成方法以及与颜色自定义、2D 缩放的集成约定，见 [`scripts/artwork/README.md`](scripts/artwork/README.md)。

## 开源协议

本项目以 [MIT License](https://opensource.org/licenses/MIT) 协议开源。
