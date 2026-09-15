import { parseClient } from "./source-parser.js";

export const REPOSITORY = "SkidderClub/Vibe";
export const REPO_URL = `https://github.com/${REPOSITORY}`;
const API = `https://api.github.com/repos/${REPOSITORY}`;

export async function request(url, json = true) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: json ? { Accept: "application/vnd.github+json" } : {},
  });
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? "GitHub request limit reached"
        : `Request failed (${response.status})`,
    );
  return json ? response.json() : response.text();
}

export async function checkSource(current, report = () => {}) {
  const repo = await request(API);
  const branch = repo.default_branch;
  const ref = await request(
    `${API}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  const sha = ref.object.sha;
  if (sha === current.sha) return current;
  report("New client update found. Loading modules…");
  const tree = await request(`${API}/git/trees/${sha}?recursive=1`);
  if (tree.truncated)
    throw new Error("GitHub returned an incomplete source tree");
  const paths = tree.tree
    .filter(
      (file) =>
        file.type === "blob" &&
        file.path.endsWith(".java") &&
        (file.path.startsWith("src/main/java/dev/vibe/module/") ||
          file.path === "src/main/java/dev/vibe/Vibe.java"),
    )
    .map((file) => file.path);
  const sources = {};
  let cursor = 0,
    completed = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, paths.length) }, async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++];
        sources[path] = await request(
          `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${path}`,
          false,
        );
        completed++;
        if (completed % 15 === 0)
          report(`Updating module library… ${completed}/${paths.length}`);
      }
    }),
  );
  const data = parseClient(sources, {
    repository: REPOSITORY,
    sha,
    branch,
    generatedAt: new Date().toISOString(),
  });
  if (
    !data.modules.length ||
    data.modules.some((module) => !module.name || !module.category)
  )
    throw new Error("Incomplete source update");
  return data;
}

export function pickJar(releases) {
  // Drafts and prereleases are deliberately excluded from the primary download.
  for (const release of releases.filter((r) => !r.draft && !r.prerelease)) {
    const asset = release.assets?.find(
      (a) =>
        /\.jar$/i.test(a.name) &&
        !/(?:sources|javadoc|dev|unmapped)\.jar$/i.test(a.name),
    );
    if (
      asset &&
      asset.browser_download_url?.startsWith(`${REPO_URL}/releases/download/`)
    )
      return {
        ...asset,
        version: release.tag_name,
        releaseUrl: release.html_url,
      };
  }
  return null;
}

export async function latestJar() {
  // A latest release without a JAR must not hide a previous usable release.
  return pickJar(await request(`${API}/releases?per_page=30`));
}

export function parseReview(issue) {
  if (
    issue.pull_request ||
    !issue.labels?.some((label) => label.name === "vibe-review")
  )
    return null;
  const rating = issue.body?.match(/^Rating:\s*([1-5])\s*\/\s*5\s*$/m);
  const body = issue.body?.match(
    /(?:^|\n)### Review\s*\r?\n([\s\S]*?)(?:\r?\n### |$)/,
  );
  if (
    !rating ||
    !body ||
    body[1].trim().length < 20 ||
    !issue.html_url?.startsWith(`${REPO_URL}/issues/`)
  )
    return null;
  return {
    rating: Number(rating[1]),
    text: body[1].trim().slice(0, 1500),
    author: issue.user?.login || "Community member",
    avatar: /^https:\/\/avatars\.githubusercontent\.com\//.test(
      issue.user?.avatar_url || "",
    )
      ? issue.user.avatar_url
      : null,
    url: issue.html_url,
    date: issue.created_at,
  };
}

export async function communityReviews() {
  const issues = await request(
    `${API}/issues?labels=vibe-review&state=all&sort=created&direction=desc&per_page=100`,
  );
  return issues.map(parseReview).filter(Boolean).slice(0, 6);
}
