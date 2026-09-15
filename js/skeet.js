// HTML port of VibeClickGui.drawSkeet / drawSkeetModule / drawSettingAt.
// Coordinates below are Minecraft GUI pixels; one scale applies to the whole
// board so the icon rail, glyphs, cards, and controls keep the source geometry.
const ICONS = {
  COMBAT: "combat",
  VISUAL: "visuals",
  MOVEMENT: "movement",
  WORLD: "world",
  MEME: "meme",
  CLIENT: "utilities",
  SCRIPTS: "scripts",
};
const element = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};
const compact = (n) =>
  Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : n.toFixed(2);

// A limited, non-executing interpreter for the source's visibility predicates.
// Unrecognized predicates stay visible, keeping every imported control reachable.
function conditionVisible(expression, module, state) {
  if (!expression) return true;
  const values = new Map(
    module.settings.map((s) => [
      s.variable,
      state.values.has(s.id) ? state.values.get(s.id) : s.default,
    ]),
  );
  let text = expression.replace(
    /([\w]+)\.(isEnabled|is|isSelected|isSelectedIgnoreCase)\(("(?:\\.|[^"\\])*"|[A-Z_]+)?\)/g,
    (match, key, method, arg) => {
      if (!values.has(key)) return match;
      const value = values.get(key);
      let expected;
      try {
        expected = arg ? JSON.parse(arg) : null;
      } catch {
        return match;
      }
      if (method === "isEnabled") return String(!!value);
      if (method === "is") return String(value === expected);
      return String(
        Array.isArray(value) &&
          value.some((x) =>
            method === "isSelectedIgnoreCase"
              ? x.toLowerCase() === expected.toLowerCase()
              : x === expected,
          ),
      );
    },
  );
  if (/[^truefals\s!&|()]/.test(text)) return true;
  const tokens = text.match(/true|false|&&|\|\||!|\(|\)/g) || [];
  let i = 0;
  function atom() {
    if (tokens[i] === "!") {
      i++;
      return !atom();
    }
    if (tokens[i] === "(") {
      i++;
      const result = or();
      if (tokens[i++] !== ")") throw Error();
      return result;
    }
    const token = tokens[i++];
    if (token !== "true" && token !== "false") throw Error();
    return token === "true";
  }
  function and() {
    let result = atom();
    while (tokens[i] === "&&") {
      i++;
      const next = atom();
      result = result && next;
    }
    return result;
  }
  function or() {
    let result = and();
    while (tokens[i] === "||") {
      i++;
      const next = and();
      result = result || next;
    }
    return result;
  }
  try {
    const result = or();
    return i === tokens.length ? result : true;
  } catch {
    return true;
  }
}

export class SkeetGUI {
  constructor(root, { onChange = () => {}, id = "playground" } = {}) {
    this.root = root;
    this.id = id;
    this.onChange = onChange;
    this.states = new Map();
    this.expanded = new Set();
    this.category = "COMBAT";
    this.query = "";
    this.showAll = false;
    this.binding = null;
    this.measure = document.createElement("canvas").getContext("2d");
    this.measure.font = '8px "Vibe Minecraft"';
    document.fonts.load('8px "Vibe Minecraft"').then(() => { if (this.client) this.render(); });
    root.classList.add("skeet-window");
    this.board = element("div", "skeet-board");
    this.rail = element("nav", "skeet-rail");
    this.rail.setAttribute("aria-label", id + " module categories");
    this.content = element("div", "skeet-content");
    this.content.tabIndex = 0;
    this.content.setAttribute("aria-label", "Scrollable module list");
    this.accent = element("canvas", "skeet-accent");
    this.accent.width = 378;
    this.accent.height = 2;
    this.accent.setAttribute("aria-hidden", "true");
    this.grip = element("span", "skeet-grip");
    this.grip.setAttribute("aria-hidden", "true");
    this.board.append(this.accent, this.rail, this.content, this.grip);
    root.replaceChildren(this.board);
    this.observer = new ResizeObserver(() => {
      const scale = root.clientWidth / 380;
      this.board.style.transform = `scale(${scale})`;
      root.style.height = 360 * scale + "px";
    });
    this.observer.observe(root);
    this.visible = true;
    this.visibility = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
    });
    this.visibility.observe(root);
    this.accentTimer = setInterval(() => {
      if (this.visible && !document.hidden) this.drawAccent();
    }, 80);
    this.board.addEventListener("keydown", (event) => {
      if (!this.binding) return;
      event.preventDefault();
      event.stopPropagation();
      const key =
        event.key === "Escape" ||
        event.key === "Delete" ||
        event.key === "Backspace"
          ? "NONE"
          : event.code
              .replace(/^Key|^Digit/, "")
              .replace("ShiftRight", "RSHIFT")
              .toUpperCase();
      this.state(this.binding).key = key;
      this.binding = null;
      this.render();
    });
  }
  state(module) {
    if (!this.states.has(module.id))
      this.states.set(module.id, {
        enabled: module.enabled,
        key: module.key,
        values: new Map(),
        alpha: new Map(),
        openMulti: new Set(),
      });
    return this.states.get(module.id);
  }
  value(module, setting) {
    const values = this.state(module).values;
    return values.has(setting.id)
      ? values.get(setting.id)
      : structuredClone(setting.default);
  }
  setClient(client) {
    this.client = client;
    this.states.clear();
    this.expanded.clear();
    const settings = client.modules.find(
      (m) => m.id === "ClickGuiModule",
    )?.settings;
    this.primary =
      settings?.find((s) => s.name === "Primary Color")?.default || "#2de2c2";
    this.secondary =
      settings?.find((s) => s.name === "Secondary Color")?.default || "#a855f7";
    if (!client.categories.some((c) => c.id === this.category))
      this.category = client.categories[0].id;
    this.render();
  }
  drawAccent() {
    if (!this.client) return;
    const rgb = (hex) =>
        hex
          .slice(1)
          .match(/../g)
          .map((s) => parseInt(s, 16)),
      first = rgb(this.primary),
      second = rgb(this.secondary);
    const blend = (a, b, n) =>
      a.map((value, i) =>
        Math.floor(value + (b[i] - value) * Math.max(0, Math.min(1, n))),
      );
    const css = (rgb) => "rgb(" + rgb.join(",") + ")",
      time = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : (Date.now() % 5500) / 5500;
    const accent = (phase) =>
        blend(
          first,
          second,
          (Math.sin((time + phase) * Math.PI * 2) + 1) * 0.5,
        ),
      base = accent(0),
      context = this.accent.getContext("2d");
    for (let x = 0; x < 378; x += 3) {
      const phase = x / 378;
      context.fillStyle = css(blend(base, accent(phase + 0.55), phase));
      context.fillRect(x, 0, 3, 2);
    }
    this.board.style.setProperty("--skeet-accent", css(accent(0.18)));
    const ordinal = this.client.categories.findIndex(
      (c) => c.id === this.category,
    );
    this.content
      .querySelectorAll(".skeet-column")
      .forEach((column, i) =>
        column.style.setProperty(
          "--skeet-accent",
          css(accent(ordinal * 0.2 + i * 0.13)),
        ),
      );
  }
  reset() {
    this.states.clear();
    this.binding = null;
    this.render();
  }
  search(query) {
    this.query = query.trim().toLowerCase();
    this.render();
  }
  allSettings(show) {
    this.showAll = show;
    this.render();
  }
  set(module, setting, value) {
    this.state(module).values.set(setting.id, value);
    this.onChange(this.summary());
  }
  modules() {
    return this.client.modules.filter((m) =>
      this.query
        ? [m.name, m.description, ...m.settings.map((s) => s.name)]
            .join(" ")
            .toLowerCase()
            .includes(this.query)
        : m.category === this.category,
    );
  }
  summary() {
    return {
      category: this.query
        ? "Search results"
        : this.client.categories.find((c) => c.id === this.category)?.name,
      shown: this.modules().length,
      total: this.client.modules.length,
      settings: this.client.settingCount,
      enabled: this.client.modules.filter((m) => this.state(m).enabled).length,
    };
  }
  render() {
    if (!this.client) return;
    this.rail.replaceChildren(
      ...this.client.categories.map((category) => {
        const button = element(
          "button",
          "skeet-category" +
            (this.category === category.id && !this.query ? " active" : ""),
        );
        button.setAttribute("aria-label", category.name + " modules");
        button.setAttribute(
          "aria-pressed",
          String(this.category === category.id && !this.query),
        );
        button.title = category.name;
        const image = element("img");
        image.src = `assets/skeet/icons/${ICONS[category.id] || "scripts"}.png`;
        image.alt = "";
        image.width = 32;
        image.height = 32;
        button.append(
          image,
          element("span", "skeet-category-label", category.name),
        );
        button.addEventListener("click", () => {
          this.category = category.id;
          this.query = "";
          this.content.scrollTop = 0;
          this.render();
          this.root.dispatchEvent(new CustomEvent("skeet-category-change"));
        });
        return button;
      }),
    );
    const scroll = this.content.scrollTop,
      columns = [
        element("div", "skeet-column"),
        element("div", "skeet-column"),
      ];
    this.modules().forEach((module, index) =>
      columns[index % 2].append(this.card(module)),
    );
    this.content.replaceChildren(...columns);
    if (!this.modules().length)
      this.content.replaceChildren(
        element(
          "p",
          "skeet-empty",
          this.query ? "No modules found." : "No modules in this category.",
        ),
      );
    this.content.scrollTop = scroll;
    this.drawAccent();
    this.onChange(this.summary());
  }
  card(module) {
    const state = this.state(module),
      card = element(
        "article",
        "skeet-module" + (state.enabled ? " enabled" : ""),
      );
    card.dataset.module = module.id;
    const row = element("div", "skeet-module-row"),
      toggle = element("button", "skeet-module-toggle", module.name);
    toggle.setAttribute("aria-pressed", String(state.enabled));
    toggle.setAttribute("aria-label", "Toggle " + module.name);
    toggle.title = module.description + " · Middle click to bind";
    toggle.addEventListener("click", () => {
      state.enabled = !state.enabled;
      card.classList.toggle("enabled", state.enabled);
      toggle.setAttribute("aria-pressed", String(state.enabled));
      this.onChange(this.summary());
    });
    const panel = element("div", "skeet-settings");
    panel.id = this.id + "-settings-" + module.id;
    const expand = element("button", "skeet-expand");
    expand.setAttribute("aria-label", module.name + " settings");
    expand.setAttribute("aria-controls", panel.id);
    const update = () => {
      const open = this.expanded.has(module.id);
      panel.hidden = !open;
      expand.textContent =
        (state.key !== "NONE" ? "[" + state.key + "] " : "") +
        (module.settings.length ? (open ? "-" : "+") : "");
      expand.setAttribute("aria-expanded", String(open));
      panel.replaceChildren(
        ...module.settings
          .filter(
            (s) => this.showAll || conditionVisible(s.condition, module, state),
          )
          .map((s) => this.setting(module, s)),
      );
    };
    const flip = () => {
      if (!module.settings.length) return;
      if (this.expanded.has(module.id)) this.expanded.delete(module.id);
      else this.expanded.add(module.id);
      update();
    };
    expand.addEventListener("click", flip);
    toggle.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      flip();
    });
    toggle.addEventListener("auxclick", (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
      this.binding = module;
      expand.textContent = "PRESS KEY";
      expand.focus();
    });
    if (this.binding === module) expand.textContent = "PRESS KEY";
    panel.addEventListener("skeet-value-change", () => {
      update();
    });
    row.append(toggle, expand);
    card.append(row, panel);
    update();
    return card;
  }
  setting(module, setting) {
    const wrapper = element("div", "skeet-setting " + setting.type);
    wrapper.dataset.setting = setting.name;
    const label = element("span", "skeet-setting-name", setting.name);
    label.title = setting.name;
    wrapper.append(label);
    const value = this.value(module, setting),
      name = module.name + ": " + setting.name,
      state = this.state(module);
    if (["boolean", "mode", "string", "multiselect"].includes(setting.type)) {
      const text = setting.type === "boolean" ? (value ? "ON" : "OFF") : setting.type === "multiselect" ? value.length + " selected" : String(value).slice(0, 15);
      wrapper.style.gridTemplateColumns = `minmax(0, 1fr) ${Math.min(80, Math.ceil(this.measure.measureText(text).width) + 1)}px`;
    }
    const changed = (value, refresh = false) => {
      this.set(module, setting, value);
      if (refresh)
        wrapper.dispatchEvent(
          new CustomEvent("skeet-value-change", { bubbles: true }),
        );
    };
    if (setting.type === "boolean") {
      const button = element(
        "button",
        "skeet-value " + (value ? "on" : "off"),
        value ? "ON" : "OFF",
      );
      button.setAttribute("role", "switch");
      button.setAttribute("aria-label", name);
      button.setAttribute("aria-checked", String(value));
      button.addEventListener("click", () =>
        changed(!this.value(module, setting), true),
      );
      wrapper.append(button);
    } else if (setting.type === "mode") {
      const select = element("select", "skeet-value");
      select.setAttribute("aria-label", name);
      select.title = setting.note || "Choose a value";
      setting.options.forEach((option) => {
        const el = element("option", "", option);
        el.value = option;
        select.append(el);
      });
      select.value = value;
      select.addEventListener("change", () => changed(select.value, true));
      wrapper.append(select);
    } else if (setting.type === "string") {
      const input = element("input", "skeet-value skeet-text");
      input.type = "text";
      input.value = value;
      input.maxLength = setting.maxLength || 96;
      input.setAttribute("aria-label", name);
      input.addEventListener("input", () => changed(input.value));
      wrapper.append(input);
    } else if (setting.type === "number" || setting.type === "range") {
      const controls = element("div", "skeet-slider-control"),
        output = element("output", "skeet-number-value");
      const track = element("div", "skeet-slider-track");
      controls.append(output, track);
      const inputs = [];
      const paint = () => {
        const values = inputs.map((input) => Number(input.value));
        output.textContent = values.map(compact).join(" - ");
        const lo =
            setting.type === "range"
              ? ((values[0] - setting.min) / (setting.max - setting.min)) * 100
              : 0,
          hi =
            ((values.at(-1) - setting.min) / (setting.max - setting.min)) * 100;
        track.style.background = `linear-gradient(to right,#243550 ${lo}%,var(--skeet-accent) ${lo}%,var(--skeet-accent) ${hi}%,#243550 ${hi}%)`;
      };
      (setting.type === "range" ? value : [value]).forEach((number, index) => {
        const input = element("input", "skeet-slider");
        input.type = "range";
        input.min = setting.min;
        input.max = setting.max;
        input.step = setting.step;
        input.value = number;
        input.setAttribute(
          "aria-label",
          name +
            (setting.type === "range" ? (index ? " maximum" : " minimum") : ""),
        );
        input.addEventListener("input", () => {
          if (setting.type === "range") {
            const pair = inputs.map((i) => Number(i.value));
            if (pair[0] > pair[1]) inputs[index ? 0 : 1].value = input.value;
            changed(inputs.map((i) => Number(i.value)));
          } else changed(Number(input.value));
          paint();
        });
        inputs.push(input);
        controls.append(input);
      });
      paint();
      wrapper.append(controls);
    } else if (setting.type === "multiselect") {
      const button = element(
        "button",
        "skeet-value multi-count",
        value.length + " selected",
      );
      button.setAttribute("aria-label", name);
      button.setAttribute(
        "aria-expanded",
        String(state.openMulti.has(setting.id)),
      );
      const options = element("div", "skeet-options");
      options.setAttribute("role", "group");
      options.setAttribute("aria-label", name);
      options.hidden = !state.openMulti.has(setting.id);
      setting.options.forEach((option) => {
        const selected = value.includes(option),
          choice = element(
            "button",
            "skeet-option" + (selected ? " selected" : ""),
            (selected ? "[x] " : "[ ] ") + option,
          );
        choice.setAttribute("aria-label", option);
        choice.setAttribute("aria-pressed", String(selected));
        choice.addEventListener("click", () => {
          const options = new Set(this.value(module, setting));
          if (options.has(option)) options.delete(option);
          else options.add(option);
          changed([...options], true);
        });
        options.append(choice);
      });
      button.addEventListener("click", () => {
        if (state.openMulti.has(setting.id)) state.openMulti.delete(setting.id);
        else state.openMulti.add(setting.id);
        options.hidden = !state.openMulti.has(setting.id);
        button.setAttribute("aria-expanded", String(!options.hidden));
      });
      wrapper.append(button, options);
    } else if (setting.type === "color") {
      const details = element("details", "skeet-color-details"),
        swatch = element("summary", "skeet-color-swatch");
      swatch.setAttribute("aria-label", name);
      swatch.title = name;
      swatch.style.setProperty("--swatch", value);
      swatch.style.setProperty(
        "--opacity",
        (state.alpha.get(setting.id) ?? setting.alpha) / 255,
      );
      const popup = element("div", "skeet-color-popup"),
        input = element("input");
      input.type = "color";
      input.value = value;
      input.setAttribute("aria-label", name + " color");
      const hex = element("input", "skeet-hex");
      hex.type = "text";
      hex.value = value.toUpperCase();
      hex.maxLength = 7;
      hex.pattern = "#[A-Fa-f0-9]{6}";
      hex.setAttribute("aria-label", name + " hex");
      input.addEventListener("input", () => {
        changed(input.value);
        hex.value = input.value.toUpperCase();
        swatch.style.setProperty("--swatch", input.value);
      });
      hex.addEventListener("input", () => {
        if (/^#[0-9a-f]{6}$/i.test(hex.value)) {
          input.value = hex.value;
          changed(hex.value);
          swatch.style.setProperty("--swatch", hex.value);
        }
      });
      const opacity = element("input");
      opacity.type = "range";
      opacity.min = 0;
      opacity.max = 255;
      opacity.step = 1;
      opacity.value = state.alpha.get(setting.id) ?? setting.alpha;
      opacity.setAttribute("aria-label", name + " opacity");
      const caption = element("output", "", `Alpha ${opacity.value}`);
      opacity.addEventListener("input", () => {
        state.alpha.set(setting.id, Number(opacity.value));
        caption.textContent = "Alpha " + opacity.value;
        swatch.style.setProperty("--opacity", Number(opacity.value) / 255);
      });
      popup.append(
        element("span", "", setting.name),
        input,
        hex,
        caption,
        opacity,
      );
      details.append(swatch, popup);
      wrapper.append(details);
    }
    if (setting.note) wrapper.title = setting.note;
    return wrapper;
  }
}
