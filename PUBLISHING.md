# Fork identity and publishing setup

The canonical repository is https://github.com/vycdev/isometric-contributions-plus, maintained by [@vycdev](https://github.com/vycdev). The product is **Isometric Contributions Plus**. No fork-owned store listing or publisher account has been verified. Local builds require no store credentials. Do not upload, publish, or create a release while validating this setup.

## Extension identities

- Firefox builds use `isometric-contributions-plus@vycdev.github.io`. This is a new extension identifier in the maintainer's GitHub namespace, not a contact email or a claim of AMO registration. Register this exact ID with the fork's AMO account before first publication; set `FIREFOX_ADDON_SLUG` to the actual registered listing slug.
- Safari uses `io.github.vycdev.isometric-contributions-plus` for the app and the same ID plus `.Extension` for the extension. These local bundle identifiers must be registered with the fork's Apple developer team before distribution. They are not Apple account IDs.
- Chrome and Edge assign their own listing IDs; none are checked in. Browser packages are named `isometric-contributions-plus-{chrome,edge,firefox}.zip`.

The Firefox ID follows [Mozilla's email-style ID guidance](https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/); Safari identifiers follow [Apple's reverse-DNS format](https://developer.apple.com/help/glossary/bundle-id/). Registration and account ownership still require maintainer verification.

## Browser stores

Configure these values only after creating listings and publisher accounts for this fork. Existing upstream accounts, IDs, and listings must not be reused. Keep credentials in environment variables locally and GitHub Actions secrets in CI; do not commit them.

| Store | Required configuration | Pending maintainer action |
| --- | --- | --- |
| Chrome | `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | Register a Plus listing under the fork publisher and configure OAuth credentials. |
| Firefox | `FIREFOX_ADDON_SLUG`, `AMO_API_KEY`, `AMO_API_SECRET` | Register the Plus add-on ID, record its actual slug, and create AMO API credentials. |
| Edge | `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` | Register a Plus product and configure Partner Center API credentials. |

In Actions, the Chrome publisher ID and Firefox slug use repository **variables**; the remaining browser-store values use **secrets**. `release.yml` validates configuration before version commits, tags, builds, or uploads. Missing or blank values report their variable names and this document, without printing values. Configuration checks only establish presence, not ownership or validity.

Safe local checks:

```sh
node scripts/submit.js all --check-config
node scripts/submit.js all --dry-run
node scripts/submit.js firefox-metadata --dry-run
node --test scripts/publishing.test.js
```

`--check-config` needs no build artifacts. Before any upload, all selected packages and the Firefox source identity are checked. `--dry-run` is offline, checks configuration/artifacts, and never authenticates, uploads, or changes metadata. Run `npm run build:firefox` immediately before submitting Firefox because other builds overwrite `dist/`; `npm run build:all` leaves the Firefox build there.

For real Firefox submission or metadata updates, the helper first reads the configured slug through the [AMO detail API](https://mozilla.github.io/addons-server/topics/api/addons.html#detail) and requires its `guid` to match the Plus add-on ID. An unrelated/missing identity or failed lookup stops the operation before any selected store receives an upload. Metadata writes address the immutable Plus ID rather than the mutable slug. These remote checks are skipped for offline dry runs and configuration checks. Actual submission commands perform external writes and require a separate, deliberate publishing action.

After publication, verify each Plus listing's owner and destination before adding its real URL to both READMEs. Do not infer URLs from the product name. First-time store registration and listing metadata are maintainer tasks; these helpers update existing listings.

## Safari

Debug/native development requires macOS and Xcode. Existing project directories and the `Isometric Contributions` Xcode target/scheme names are retained so scripts and relative resources resolve. The built products, display names, menus, popup, bundle IDs, and runtime extension lookup use Plus identity. Artwork remains the separate scope of issue #1.

Signed Release builds require:

| Environment variable | Meaning / Actions source |
| --- | --- |
| `APPLE_TEAM_ID` | Fork's registered developer team; secret. |
| `APPLE_SIGNING_IDENTITY` | Exact application certificate identity; repository variable. |
| `APPLE_INSTALLER_IDENTITY` | Exact installer certificate identity; repository variable. |
| `APPLE_APP_PROFILE_NAME` | Provisioning profile name for the Plus app bundle ID; repository variable. |
| `APPLE_EXTENSION_PROFILE_NAME` | Provisioning profile name for the Plus extension bundle ID; repository variable. |

`node scripts/configure-safari.js` validates those values and generates `.deriveddata-safari/Signing.xcconfig` and `.deriveddata-safari/ExportOptions.plist`. Generated files are ignored. The tracked `safari/ExportOptions.template.plist` is a template, not a usable export configuration. Do not pass it directly to Xcode. Profile settings are target-specific; the app and extension must not share a profile.

`npm run build:safari:release` validates and generates signing configuration before building, then passes it to Xcode. `npm run build:safari -- --resources-only` only compiles/copies browser assets and requires no Apple configuration.

The Safari release workflow additionally requires secrets `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_INSTALLER_CERT_BASE64`, `APPLE_INSTALLER_CERT_PASSWORD`, `PROVISIONING_PROFILE_APP_BASE64`, `PROVISIONING_PROFILE_EXT_BASE64`, `ASC_API_KEY_BASE64`, `ASC_API_KEY_ID`, and `ASC_API_ISSUER_ID`. Certificates, profile contents/names, team, registered bundle IDs, and the App Store Connect app record must all belong together. The workflow checks presence before importing certificates or archiving. None of these account values is known yet. Native compilation/signing and App Store validation require macOS and the configured fork accounts.

## Support and private reporting

Public bugs, privacy questions, and support go to https://github.com/vycdev/isometric-contributions-plus/issues. The maintainer is [@vycdev](https://github.com/vycdev). Issues are public. A private conduct/security reporting address or channel still needs a maintainer decision; none has been invented or inherited. Do not post sensitive evidence in issues. A public request for a private channel should omit incident details. Update `CODE_OF_CONDUCT.md` and `PRIVACY.md` together when a private channel is established.

## Reference audit and sibling integration

The issue #9 audit covered every tracked file, including hidden workflows/configuration, both documentation languages, policies, source/tests, dependency metadata, build/release helpers, Safari native resources, and inherited image assets.

- Retain Jason Long's original MIT copyright in `LICENSE`, Swift creation headers, and explicit upstream attribution in both READMEs. Keep vendored obelisk.js author/license notices, dependency URLs, Apple plist DTDs, and Contributor Covenant links.
- `test-extension.js` intentionally uses `https://github.com/jasonlong` as an active-profile test fixture, alongside the inactive `dork` profile. Neither is a support or publisher destination.
- The `isometric-contributions` canvas ID, test selectors, Xcode source directories/target/scheme labels, and GitHub content-script match patterns remain internal compatibility references, not the fork's public name or repository URL.
- Qiuner's similarly named repository remains a clearly labeled separate related project. The original PNG artwork and installation screenshots remain inherited binary assets for issue #1 / PR #8; stale installation screenshots are no longer used as current instructions. The missing `img/preview-dark.png` reference has been removed.
- Package download/funding links and third-party tooling contacts are dependency metadata. No operational link should use the obsolete pre-rename fork URL.
- [PR #8 / issue #1](https://github.com/vycdev/isometric-contributions-plus/pull/8) overlaps on display names, READMEs, artwork, and generated Safari resources. Keep Plus names/support/download guidance from this change, adopt its artwork, and regenerate Safari resources after integration.
- [PR #7 / issue #4](https://github.com/vycdev/isometric-contributions-plus/pull/7) overlaps on scripts, workflows, package metadata, and installation commands. Preserve its pnpm launcher/ZIP changes while retaining this change's shared artifact names, publishing guards, fork IDs, and workflow variables. Update commands here to pnpm and regenerate browser/Safari resources after integration. This branch retains the base's npm toolchain.
