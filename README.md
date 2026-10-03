# Vibe Client website

A responsive, static HTML/CSS/JavaScript website for **Vibe**, ready for GitHub Pages. No framework, runtime server, API keys, or production dependencies.

## Preview locally

Requires Node.js 22 or later:

```sh
node scripts/serve.mjs
```

Open **http://127.0.0.1:4173**. Use a local server rather than opening `index.html` with `file://`, because browser modules and source JSON use HTTP. `npm start` also works; in Windows PowerShell with restricted script execution, use `npm.cmd start`.

## Publish on GitHub Pages

1. Push the website files to a GitHub repository on `main` or `master`. The existing `.gitignore` excludes the temporary client checkout and testing tools.
2. In **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, your website branch, and the root folder.
3. Push changes to that branch to update the website.

All asset URLs are relative, so both `username.github.io` and `username.github.io/repository/` work. Keep `CNAME` when deploying to the existing custom domain. The `.cache` source checkout and testing tools are ignored and are not public site files.

## Automatic module and setting updates

- `data/client.json` is a bundled, generated source snapshot, so the playground starts without waiting for GitHub.
- On each visit, the website checks the **current default branch of `SkidderClub/Vibe`**. If its commit changed, it fetches the module source at that specific commit and regenerates the complete explorer. It also checks every five minutes while the page is visible; **Refresh** checks immediately.
- Source downloads run with bounded concurrency. A successful update is cached locally. If GitHub is offline, rate-limited, or an import fails, the last working snapshot remains usable and its status is shown honestly.
- Run the snapshot regeneration command below before publishing to refresh the bundled fallback too.
- The reader imports registered modules, categories, defaults, limits, increments, strings, colors with opacity, modes, multiselects, helper factories, nested ESP profiles, the composed 2D appearance system, gradient stops, entity-color controls, and HUD array settings. It reads the client version from the upstream build file and does not execute Java source.
- The playground follows the client's conditional setting visibility. Turn on **Show all settings** to explore every imported control, including controls normally hidden by another choice. Controls affect only the demo. Enabling modules never runs client code, opens local files, changes the website theme, or connects to Minecraft.
- Choices based on a player's local files (for example ROMs and Waifu images) are marked as local to the client. User-installed runtime scripts cannot be known from the public repository.
- A future upstream Java structure may require updating `js/source-parser.js`. Unsupported declarations fail the import instead of replacing the working snapshot with a partial one. The source commit and failure state remain visible; no website can guarantee arbitrary future source changes or uninterrupted GitHub access.

To regenerate manually:

```sh
git clone --depth 1 https://github.com/SkidderClub/Vibe.git .cache/vibe-source
node scripts/sync-client.mjs
```

If the checkout already exists, use `git -C .cache/vibe-source pull --ff-only` first. An alternate checkout directory can be passed as the first script argument.

## Downloads

Vibe is distributed through the launcher. The single download card checks the latest 30 public, stable releases in **SkidderClub/Vibe**, newest publication first.

The launcher button automatically selects a release installer (`.exe`, `.msi`, `.dmg`, `.pkg`, `.AppImage`, `.deb`, or `.rpm`) or a launcher-named `.jar`, `.zip`, or `.tar.gz`. Name archive assets with `Launcher` (for example `VibeLauncher.zip`) so they can be distinguished from mod/source archives. Windows, macOS, and Linux installers are preferred according to the visitor's platform.

Publish the launcher as a stable GitHub release with its download file attached. The site checks once per minute while visible, when returning to the tab, and when **Refresh downloads** is clicked. Until a file is published, the enabled button opens GitHub releases. **View latest GitHub release** links to the newest release and its complete asset list. Failed API requests retain working download links.

## Discord

The header, mobile navigation, hero, and footer link to the invite from Vibe's README: `https://dsc.gg/vibe-skidder-club`.

## Featured reviews

The four featured quotes are the exact reviews supplied by the website owner, attributed to **@heisthacks**. The profile links to [@heisthacksjp on YouTube](https://www.youtube.com/@heisthacksjp); its public channel avatar is bundled locally. These quotes are curated content in `js/app.js`, with no invented ratings, dates, or verification badges.

**Write a review** lets visitors compose feedback and opens a prefilled GitHub issue. The visitor signs in, reviews the draft, and publishes it themselves. Submissions do not automatically replace the four featured quotes.

## Skeet previews

The hero and playground share `js/skeet.js`, a browser port of Vibe's Skeet layout: original category PNGs, Minecraft glyphs, board geometry, colors, module rows, and animated accent. Website palettes leave the client preview's colors independent. See [asset sources](assets/skeet/README.md) for provenance and the browser-native color editor detail.

- Left click a module to toggle it; right click or click its `+` to expand settings.
- Middle click a module, then press a key to preview a binding. Escape clears it.
- Modes, booleans, sliders, ranges, strings, multiselects, colors, and opacity are editable.
- Search covers every category. Reset restores source defaults. The two GUI instances maintain independent state.

## Customization

- **Themes:** 49 palettes in `js/themes.js`: 24 dark, 24 with white backgrounds, and one animated rainbow. The selection persists locally.
- **Screenshots:** Two independent galleries show ClickGUIs and other GUIs side by side, stacking on small screens. Original images remain in `assets/screenshots/`; edit the `galleries` manifest in `js/app.js` to add more.
- **Mottos:** The seven phrases in `MOTTOS` in `js/app.js` rotate with a typing effect. Update the accessible text in `index.html` when changing them. Reduced-motion preferences show a complete, static phrase.
- **Branding/copy/layout:** `index.html`, `styles.css`, and `css/updates.css`.
- **Fonts:** DM Sans and Space Grotesk load from Google Fonts with system fallbacks; the Skeet font is bundled locally.
- **Credits:** The footer includes the requested `Make with <3 by SkidderClub` text.

## Validation

```sh
node --test tests/*.test.mjs
```

Tests check source extraction, helper/nested profile expansion, unsupported source changes, setting bounds, release selection, and review validation. There is no install step for these checks.
