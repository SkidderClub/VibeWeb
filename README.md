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
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. Open **Actions → Refresh Vibe source and deploy Pages → Run workflow**, or push a change to start it.

The included workflow updates the source snapshot, validates it, stages only public website files, and deploys the site. It also runs hourly. All asset URLs are relative, so both `username.github.io` and `username.github.io/repository/` work. The workflow follows the [GitHub Pages custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

You can also host these files directly using Pages' **Deploy from a branch** option, root folder. Browser refresh continues to work, but the scheduled workflow is intended for the **GitHub Actions** deployment option.

## Automatic module and setting updates

- `data/client.json` is a bundled, generated source snapshot, so the playground starts without waiting for GitHub.
- On each visit, the website checks the **current default branch of `SkidderClub/Vibe`**. If its commit changed, it fetches the module source at that specific commit and regenerates the complete explorer. It also checks every five minutes while the page is visible; **Refresh** checks immediately.
- Source downloads run with bounded concurrency. A successful update is cached locally. If GitHub is offline, rate-limited, or an import fails, the last working snapshot remains usable and its status is shown honestly.
- The hourly Pages workflow refreshes the bundled snapshot for everyone. GitHub controls schedule timing; a run can be delayed or disabled by repository inactivity/settings.
- The reader imports registered modules, categories, defaults, limits, increments, strings, colors with opacity, modes, multiselects, helper factories, and nested ESP profile controls. It does not execute Java source.
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

The primary download looks for a published, non-prerelease `.jar` in the latest 30 GitHub releases, excluding source/javadoc/development archives. Upload the installable mod JAR to a release in **SkidderClub/Vibe** and the button will pick it up automatically. Until a JAR is published, the button opens the release page and states that no JAR is available. If the API is unavailable, it keeps the working GitHub release link.

The launcher is clearly marked **Coming soon** and its button is disabled.

## Featured reviews

The four featured quotes are the exact reviews supplied by the website owner, attributed to **@heisthack**. The profile links to [@heisthacksjp on YouTube](https://www.youtube.com/@heisthacksjp); its public channel avatar is bundled locally. These quotes are curated content in `js/app.js`, with no invented ratings, dates, or verification badges.

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
