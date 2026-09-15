import { checkSource, latestJar, REPO_URL } from "./github.js";
import { THEMES, findTheme } from "./themes.js";
import { SkeetGUI } from "./skeet.js";

const $ = (selector) => document.querySelector(selector),
  $$ = (selector) => [...document.querySelectorAll(selector)];
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}
function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 2600);
}
let currentTheme = findTheme(readStorage("vibe-theme")).id;
const themeGroups = {
  inline: findTheme(currentTheme).mode,
  dialog: findTheme(currentTheme).mode,
};
function renderThemes(place) {
  const holder = $(place === "inline" ? "#inline-themes" : "#all-themes"),
    mode = themeGroups[place];
  const themes = THEMES.filter((t) => t.mode === mode);
  holder.replaceChildren(
    ...(place === "inline" ? themes.slice(0, 8) : themes).map((theme) => {
      const button = node(
        "button",
        "theme-tile" + (theme.id === currentTheme ? " active" : ""),
      );
      button.dataset.theme = theme.id;
      button.dataset.mode = theme.mode;
      button.setAttribute("aria-label", theme.name + " color theme");
      button.setAttribute("aria-pressed", String(theme.id === currentTheme));
      button.style.setProperty("--swatch", theme.swatch);
      button.style.setProperty(
        "--swatch-secondary",
        theme.mode === "light" ? theme.swatch + "88" : theme.secondary,
      );
      const swatch = node("span", "swatch");
      swatch.append(icon("check"));
      button.append(
        swatch,
        node(
          "span",
          "",
          theme.mode === "light"
            ? theme.name.replace(" Light", "")
            : theme.name,
        ),
      );
      button.addEventListener("click", () => applyTheme(theme.id, true));
      return button;
    }),
  );
  holder.classList.toggle("rainbow-grid", mode === "rainbow");
  $$(`[data-theme-tabs="${place}"] [data-theme-mode]`).forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.themeMode === mode),
    ),
  );
}
function applyTheme(id, announce = false) {
  const theme = findTheme(id),
    root = document.documentElement;
  currentTheme = theme.id;
  root.dataset.mode = theme.mode;
  root.dataset.theme = theme.id;
  root.style.setProperty(
    "--accent",
    theme.mode === "rainbow"
      ? "hsl(var(--spectrum-hue) 92% 73%)"
      : theme.accent,
  );
  root.style.setProperty(
    "--accent-2",
    theme.mode === "rainbow"
      ? "hsl(calc(var(--spectrum-hue) + 90) 90% 60%)"
      : theme.secondary,
  );
  root.style.setProperty(
    "--accent-rgb",
    theme.accent
      .slice(1)
      .match(/../g)
      .map((x) => parseInt(x, 16))
      .join(","),
  );
  $$("[data-theme]").forEach((button) => {
    if (button === root) return;
    const selected = button.dataset.theme === theme.id;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  $$(".current-theme-name").forEach((el) => {
    el.textContent = theme.name;
  });
  $('meta[name="theme-color"]').content =
    theme.mode === "light" ? "#ffffff" : "#0b0d0b";
  const saved = saveStorage("vibe-theme", theme.id);
  $(".theme-saved").replaceChildren(
    document.createTextNode(saved ? "SAVED LOCALLY" : "THIS SESSION"),
    icon("check"),
  );
  if (themeGroups.inline !== theme.mode) {
    themeGroups.inline = theme.mode;
    renderThemes("inline");
  }
  if (announce) toast(theme.name + " theme selected");
}
$$("[data-theme-tabs]").forEach((tabs) =>
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-mode]");
    if (!button) return;
    themeGroups[tabs.dataset.themeTabs] = button.dataset.themeMode;
    renderThemes(tabs.dataset.themeTabs);
  }),
);
renderThemes("inline");
renderThemes("dialog");
applyTheme(currentTheme);
$$("[data-open-themes]").forEach((button) =>
  button.addEventListener("click", () => {
    themeGroups.dialog = findTheme(currentTheme).mode;
    renderThemes("dialog");
    $("#theme-dialog").showModal();
  }),
);
$$("[data-close-dialog]").forEach((button) =>
  button.addEventListener("click", () => button.closest("dialog").close()),
);
$$("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }),
);
$(".mobile-menu-button").addEventListener("click", () => {
  const open = $("#mobile-nav").hidden;
  $("#mobile-nav").hidden = !open;
  $(".mobile-menu-button").setAttribute("aria-expanded", String(open));
  $(".mobile-menu-button").setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
});
$$("#mobile-nav a").forEach((link) =>
  link.addEventListener("click", () => {
    $("#mobile-nav").hidden = true;
    $(".mobile-menu-button").setAttribute("aria-expanded", "false");
  }),
);

const MOTTOS = [
  "Start vibeing now",
  "Don't worry, Astra will take care of your problems",
  "Get good get Vibe",
  "Welcome to Vibe",
  "Why Vape when Vibe",
  "Don't make any mistakes",
  "no mistakes allowed",
];
let mottoIndex = 0,
  letter = 0,
  deleting = false,
  typingTimer;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function typeMotto() {
  if (document.hidden) return;
  const message = MOTTOS[mottoIndex];
  if (reducedMotion.matches) {
    $("#typed-motto").textContent = message;
    $("#motto-count").textContent = String(mottoIndex + 1).padStart(2, "0") + " / " + String(MOTTOS.length).padStart(2, "0");
    return;
  }
  letter += deleting ? -1 : 1;
  $("#typed-motto").textContent = message.slice(0, letter);
  $("#motto-count").textContent =
    String(mottoIndex + 1).padStart(2, "0") +
    " / " +
    String(MOTTOS.length).padStart(2, "0");
  let delay = deleting ? 25 : 55;
  if (!deleting && letter === message.length) {
    deleting = true;
    delay = 2400;
  } else if (deleting && letter === 0) {
    deleting = false;
    mottoIndex = (mottoIndex + 1) % MOTTOS.length;
    delay = 400;
  }
  typingTimer = setTimeout(typeMotto, delay);
}
function resumeTyping() {
  clearTimeout(typingTimer);
  if (!document.hidden) typeMotto();
}
document.addEventListener("visibilitychange", resumeTyping);
reducedMotion.addEventListener("change", resumeTyping);
typeMotto();

let client = null,
  busy = false;
const playground = new SkeetGUI($("#skeet-window"), {
  id: "playground",
  onChange: (state) => {
    $("#category-title").textContent = state.category;
    $("#module-summary").textContent =
      `${state.shown} modules shown · ${state.settings} settings · ${state.enabled} enabled in preview`;
  },
});
const heroGUI = new SkeetGUI($("#hero-skeet"), { id: "hero" });
function renderClient(data) {
  client = data;
  playground.setClient(data);
  heroGUI.setClient(data);
  $$("[data-version]").forEach((el) => {
    el.textContent = data.version;
  });
  $$("[data-module-count]").forEach((el) => {
    el.textContent = data.modules.length;
  });
  $("#source-link").href = `${REPO_URL}/tree/${data.sha}`;
}
$("#module-search").addEventListener("input", (event) =>
  playground.search(event.target.value),
);
$("#show-all-settings").addEventListener("change", (event) =>
  playground.allSettings(event.target.checked),
);
$("#skeet-window").addEventListener("skeet-category-change", () => {
  $("#module-search").value = "";
});
$("#reset-demo").addEventListener("click", () => {
  playground.reset();
  toast("Playground reset to source defaults");
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName,
    ) &&
    !$("dialog[open]")
  ) {
    event.preventDefault();
    $("#module-search").focus();
  }
});

function syncStatus(message, healthy = true) {
  const dot = node("span", "status-dot");
  if (!healthy) dot.style.background = "#8b927f";
  $("#sync-status").replaceChildren(dot, document.createTextNode(message));
}
async function sync() {
  if (!client || busy) return;
  busy = true;
  $("#sync-button").disabled = true;
  syncStatus("Checking latest Vibe source…");
  try {
    const updated = await checkSource(client, (message) => syncStatus(message));
    if (updated.sha !== client.sha) {
      // Clear obsolete settings instead of carrying incompatible values into a new schema.

      renderClient(updated);
      saveStorage("vibe-source-v1", updated);
    }
    syncStatus(
      `Synced with GitHub · ${client.sha.slice(0, 7)} · ${client.modules.length} modules / ${client.settingCount} settings`,
    );
  } catch (error) {
    console.warn("Vibe source sync:", error.message);
    syncStatus(
      `Snapshot ${client.sha.slice(0, 7)} · Live update unavailable. Retry with Refresh.`,
      false,
    );
  } finally {
    busy = false;
    $("#sync-button").disabled = false;
  }
}
async function loadClient() {
  try {
    const response = await fetch("data/client.json");
    if (!response.ok) throw new Error("Snapshot unavailable");
    const bundled = await response.json(),
      cached = readStorage("vibe-source-v1");
    const data =
      cached?.schemaVersion === 1 &&
      Array.isArray(cached.modules) &&
      Array.isArray(cached.categories) &&
      cached.modules.length &&
      Date.parse(cached.generatedAt) > Date.parse(bundled.generatedAt)
        ? cached
        : bundled;
    renderClient(data);
    syncStatus(
      `Source snapshot ${data.sha.slice(0, 7)} · Checking for updates…`,
    );
    await sync();
  } catch (error) {
    $("#skeet-window").replaceChildren(
      node(
        "p",
        "empty-search",
        "The module library could not load. Reload this page to try again.",
      ),
    );
    syncStatus("Module library unavailable. Check your connection.", false);
    console.warn(error.message);
  }
}
$("#sync-button").addEventListener("click", () =>
  client ? sync() : loadClient(),
);
setInterval(
  () => {
    if (!document.hidden) sync();
  },
  5 * 60 * 1000,
);
loadClient();

const galleries = {
  clickgui: ["Skeet", "Futuristic", "Neverlose", "Augustus", "Xanax"].map(
    (file) => ({
      name: file === "Neverlose" ? "NeverLose" : file,
      path: `assets/screenshots/ClickGUIs/${file}.png`,
    }),
  ),
  other: [
    ["HUDEditor", "HUD Editor"],
    ["ESPPreview", "ESP Preview"],
    ["CosmeticEditor", "Cosmetics Editor"],
    ["CosmeticPreview", "Cosmetics Preview"],
    ["ConfigEditor", "Config Editor"],
    ["FriendEditor", "Friend Editor"],
    ["InventoryEditor", "Inventory Editor"],
    ["KeybindManager", "Keybind Manager"],
    ["MainMenu", "Main Menu"],
    ["NESEmulator", "NES Emulator"],
    ["GTA7", "GTA7"],
    ["GameRequest", "Game Request"],
    ["TicTacToe", "Tic Tac Toe"],
    ["Slots", "Slots"],
  ].map(([file, name]) => ({
    name,
    path: `assets/screenshots/OtherGUIs/${file}.png`,
  })),
};
function openLightbox(item) {
  $("#lightbox-image").src = item.path;
  $("#lightbox-image").alt = "Vibe " + item.name + " interface in Minecraft";
  $("#lightbox-caption").textContent = item.name + " / Vibe Client";
  $("#lightbox").showModal();
}
$$("[data-gallery]").forEach((panel) => {
  const list = galleries[panel.dataset.gallery],
    select = panel.querySelector("select"),
    image = panel.querySelector(".showcase-image");
  let index = 0;
  list.forEach((item, i) => {
    const option = node("option", "", item.name);
    option.value = i;
    select.append(option);
  });
  const thumbnails = list.map((item, i) => {
    const button = node("button", "showcase-thumbnail");
    button.setAttribute("aria-label", "Preview " + item.name);
    const image = node("img");
    image.src = item.path;
    image.alt = "";
    image.loading = "lazy";
    image.width = 100;
    image.height = 54;
    button.append(image, node("span", "", item.name));
    button.addEventListener("click", () => show(i));
    return button;
  });
  panel.querySelector(".showcase-thumbnails").append(...thumbnails);
  function show(next) {
    index = (next + list.length) % list.length;
    const item = list[index];
    select.value = index;
    image.src = item.path;
    image.alt = "Vibe " + item.name + " interface in Minecraft";
    panel.querySelector(".showcase-image-name").textContent = item.name;
    panel
      .querySelector(".showcase-open")
      .setAttribute("aria-label", "Enlarge " + item.name + " screenshot");
    panel.querySelector(".gallery-counter").textContent =
      String(index + 1).padStart(2, "0") +
      " / " +
      String(list.length).padStart(2, "0");
    thumbnails.forEach((button, i) => {
      button.classList.toggle("active", i === index);
      button.setAttribute("aria-pressed", String(i === index));
    });
  }
  select.addEventListener("change", () => show(Number(select.value)));
  panel
    .querySelector(".showcase-prev")
    .addEventListener("click", () => show(index - 1));
  panel
    .querySelector(".showcase-next")
    .addEventListener("click", () => show(index + 1));
  panel
    .querySelector(".showcase-open")
    .addEventListener("click", () => openLightbox(list[index]));
  image.addEventListener("error", () => {
    panel.querySelector(".showcase-image-name").textContent =
      "Image unavailable — choose another screenshot";
  });
  show(0);
});

async function loadDownload() {
  try {
    const asset = await latestJar();
    if (asset) {
      $("#jar-download").href = asset.browser_download_url;
      $("#jar-download").querySelector("span").textContent =
        "Download Vibe .jar";
      $("#release-status").textContent =
        `${asset.version} · ${(asset.size / 1024 / 1024).toFixed(1)} MB · Official GitHub release`;
    } else {
      $("#release-status").textContent =
        "No published .jar yet. Releases will appear here automatically.";
    }
  } catch {
    $("#release-status").textContent =
      "Release check unavailable. Browse GitHub releases directly.";
  }
}
loadDownload();

const suppliedReviews = [
  "+rep best client of all time",
  "+rep dev knows what they are doing, high quality development team",
  "+rep very good client, high quality, no virus",
  "+rep very nice development team + its free",
];
$("#reviews-list").replaceChildren(
  ...suppliedReviews.map((review) => {
    const card = node("article", "review-card");
    card.append(
      node("div", "review-rep", "+rep"),
      node("blockquote", "", review),
    );
    const author = node("a", "review-author");
    author.href = "https://www.youtube.com/@heisthacksjp";
    author.target = "_blank";
    author.rel = "noopener noreferrer";
    const avatar = node("img");
    avatar.src = "assets/reviews/heisthack.jpg";
    avatar.alt = "";
    avatar.width = 38;
    avatar.height = 38;
    avatar.loading = "lazy";
    const name = node("span", "", "@heisthack");
    name.append(node("small", "", "Vibe community"));
    author.append(avatar, name, icon("external"));
    card.append(author);
    return card;
  }),
);

$("#write-review").addEventListener("click", () =>
  $("#review-dialog").showModal(),
);
$("#review-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const review = $("#review-text").value.trim();
  if (review.length < 20) {
    $("#review-text").setCustomValidity("Please write at least 20 characters.");
    $("#review-text").reportValidity();
    return;
  }
  const rating = $("#review-rating").value;
  const body = `Rating: ${rating}/5\n\n### Review\n${review}\n\n### Client version\n${client?.version || "Not specified"}\n\nSubmitted via the Vibe website.`;
  const params = new URLSearchParams({
    title: `[Review] ${rating}/5 — My Vibe experience`,
    body,
  });
  // Navigate in the same tab so popup blockers cannot discard the review draft.
  window.location.assign(`${REPO_URL}/issues/new?${params}`);
});
$("#review-text").addEventListener("input", () =>
  $("#review-text").setCustomValidity(""),
);

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting)
          $$(".desktop-nav a").forEach((link) =>
            link.classList.toggle(
              "active",
              link.hash === "#" + entry.target.id,
            ),
          );
      }),
    { rootMargin: "-15% 0px -60% 0px" },
  );
  $$("main section[id]").forEach((section) => observer.observe(section));
}
