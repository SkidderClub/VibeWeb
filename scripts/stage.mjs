import { cp, mkdir } from "node:fs/promises";

// Explicit allowlist keeps the source checkout, tests, and local tooling private.
await mkdir(".cache/site", { recursive: true });
for (const path of [
  "index.html",
  "styles.css",
  "css",
  ".nojekyll",
  "assets",
  "js",
  "data",
]) {
  await cp(path, `.cache/site/${path}`, { recursive: true });
}
console.log("Static website staged in .cache/site");
