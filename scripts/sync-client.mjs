import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseClient } from "../js/source-parser.js";

const sourceRoot = resolve(process.argv[2] || ".cache/vibe-source");
const sources = {};
async function walk(directory) {
  for (const file of await readdir(resolve(sourceRoot, directory), {
    withFileTypes: true,
  })) {
    const path = directory + "/" + file.name;
    if (file.isDirectory()) await walk(path);
    else if (file.name.endsWith(".java"))
      sources[path] = await readFile(resolve(sourceRoot, path), "utf8");
  }
}
await walk("src/main/java/dev/vibe/module");
sources["src/main/java/dev/vibe/Vibe.java"] = await readFile(
  resolve(sourceRoot, "src/main/java/dev/vibe/Vibe.java"),
  "utf8",
);
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();
const data = parseClient(sources, {
  repository: "SkidderClub/Vibe",
  sha,
  generatedAt: new Date().toISOString(),
});
await mkdir("data", { recursive: true });
await writeFile("data/client.json", JSON.stringify(data, null, 2) + "\n");
console.log(
  `Synced Vibe ${data.version}: ${data.modules.length} modules, ${data.settingCount} settings, ${data.categories.length} categories (${sha.slice(0, 7)})`,
);
