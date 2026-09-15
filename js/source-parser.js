// A non-executing reader for Vibe's Java setting declarations. Shared by the
// browser and scheduled snapshot builder. Unknown structures fail the sync.
export function stripComments(source) {
  return source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match) => (match.startsWith("/") ? match.replace(/[^\n]/g, " ") : match),
  );
}

export function splitArgs(source, separator = ",") {
  const parts = [];
  let start = 0,
    depth = 0,
    quote = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === separator && depth === 0) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function enclosed(source, start, open = "(", close = ")") {
  let depth = 0,
    quote = "";
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0)
      return { text: source.slice(start + 1, i), end: i + 1 };
  }
  throw new Error("Unbalanced Java declaration");
}

function value(expression, env) {
  const s = expression?.trim();
  if (s == null) throw new Error("Missing argument");
  if (Object.hasOwn(env, s)) return env[s];
  if (s.startsWith("(") && enclosed(s, 0).end === s.length)
    return value(enclosed(s, 0).text, env);
  for (const operator of ["|", "&"]) {
    const parts = splitArgs(s, operator);
    if (parts.length > 1)
      return parts
        .map((x) => value(x, env))
        .reduce((a, b) => (operator === "|" ? a | b : a & b));
  }
  const sum = splitArgs(s, "+");
  if (sum.length > 1)
    return sum.map((x) => value(x, env)).reduce((a, b) => a + b);
  if (/^"(?:\\.|[^"\\])*"$/.test(s)) return JSON.parse(s);
  if (/^0x[\da-f]+$/i.test(s)) return Number(s);
  if (/^-?(?:\d*\.)?\d+(?:e[+-]?\d+)?[dfl]?$/i.test(s))
    return Number(s.replace(/[dfl]$/i, ""));
  if (s === "true" || s === "false") return s === "true";
  if (/Collections\.(?:<\w+>)?empty(?:List|Set)\(\)/.test(s) || s === "null")
    return [];
  if (/^(?:Arrays\.asList|Collections\.singletonList|List\.of)\(/.test(s))
    return splitArgs(enclosed(s, s.indexOf("(")).text).map((x) =>
      value(x, env),
    );
  if (/^new String\[\]\s*\{/.test(s))
    return splitArgs(enclosed(s, s.indexOf("{"), "{", "}").text).map((x) =>
      value(x, env),
    );
  if (s.includes(".") && Object.hasOwn(env, s.split(".").at(-1)))
    return env[s.split(".").at(-1)];
  throw new Error(`Unresolved Java value: ${s}`);
}

function constants(source, base = {}) {
  const env = { ...base };
  for (const m of source.matchAll(
    /(?:static\s+)?final\s+(?:String|int|double|float|List<String>)\s+(\w+)\s*=\s*([^;]+);/g,
  )) {
    try {
      env[m[1]] = value(m[2], env);
    } catch {
      /* Not a literal setting constant. */
    }
  }
  return env;
}

function setting(type, args, env, variable) {
  const name = value(args[0], env),
    kind = type.replace("Setting", "").toLowerCase();
  if (typeof name !== "string") throw new Error("Setting name is not a string");
  const item = { id: name, variable, name, type: kind };
  if (kind === "multiselect") {
    item.options = value(args[1], env);
    item.default = value(args[2], env);
  } else {
    item.default = value(args[1], env);
  }
  if (kind === "number" || kind === "range") {
    const offset = kind === "range" ? 1 : 0;
    if (offset) item.default = [item.default, value(args[2], env)];
    item.min = value(args[2 + offset], env);
    item.max = value(args[3 + offset], env);
    item.step = value(args[4 + offset], env);
    if (
      ![item.min, item.max, item.step, ...[].concat(item.default)].every(
        Number.isFinite,
      ) ||
      item.min > item.max ||
      item.step <= 0
    )
      throw new Error(`Invalid bounds: ${name}`);
  } else if (kind === "mode") {
    item.options = [];
    for (const arg of args.slice(2)) {
      if (arg.includes("->") || /^(visible|selected)$/.test(arg)) continue;
      try {
        item.options.push(...[].concat(value(arg, env)));
      } catch {
        item.dynamic = true;
      }
    }
    item.options = [...new Set([item.default, ...item.options])].filter(
      (x) => typeof x === "string",
    );
    if (item.dynamic)
      item.note = "Additional choices are loaded from your local client files.";
  } else if (kind === "color") {
    const n = Number(item.default) >>> 0;
    item.default = "#" + (n & 0xffffff).toString(16).padStart(6, "0");
    item.alpha = (n >>> 24) & 255;
  } else if (kind === "string") {
    item.maxLength =
      args[2] && !args[2].includes("->") ? value(args[2], env) : 96;
  } else if (!["boolean", "multiselect"].includes(kind))
    throw new Error(`Unsupported setting type: ${type}`);
  // Visibility is displayed as metadata. All settings stay reachable in the demo.
  const condition = args.find((x) => x.includes("->"));
  if (condition && !/^\(\)\s*->\s*true$/.test(condition))
    item.condition = condition.replace(/^\(\)\s*->\s*/, "");
  return item;
}

function readSettings(raw, inheritedEnv = {}, inheritedHelpers = {}) {
  let source = raw;
  const env = constants(source, inheritedEnv),
    helpers = { ...inheritedHelpers },
    inner = {};
  // Remove nested classes and visit their instantiated constructors separately.
  for (const m of [
    ...source.matchAll(
      /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?class\s+(\w+)[^{]*\{/g,
    ),
  ].reverse()) {
    const body = enclosed(source, m.index + m[0].length - 1, "{", "}");
    inner[m[1]] = body.text;
    source =
      source.slice(0, m.index) +
      " ".repeat(body.end - m.index) +
      source.slice(body.end);
  }
  for (const m of [
    ...source.matchAll(
      /(?:private|public|protected)\s+(?:static\s+)?(\w+Setting)\s+(\w+)\s*\(/g,
    ),
  ].reverse()) {
    const params = enclosed(source, m.index + m[0].length - 1);
    const brace = source.indexOf("{", params.end);
    const body = enclosed(source, brace, "{", "}");
    helpers[m[2]] = {
      type: m[1],
      params: splitArgs(params.text).map((x) => x.trim().split(/\s+/).at(-1)),
      body: body.text,
    };
    source =
      source.slice(0, m.index) +
      " ".repeat(body.end - m.index) +
      source.slice(body.end);
  }
  const output = [];
  function parseExpression(expression, context, variable) {
    const expressionStart = expression.trim().replace(/^addSetting\(/, "");
    const direct = expressionStart.match(
      /^new\s+(?:[\w]+\.)*(\w+Setting)\s*\(/,
    );
    if (direct)
      return setting(
        direct[1],
        splitArgs(enclosed(expressionStart, direct[0].length - 1).text),
        context,
        variable,
      );
    const call = expressionStart.match(/^(\w+)\s*\(/);
    if (!call || !helpers[call[1]])
      throw new Error(
        `Unknown setting factory: ${expressionStart.slice(0, 90)}`,
      );
    const helper = helpers[call[1]],
      supplied = splitArgs(enclosed(expressionStart, call[0].length - 1).text),
      local = { ...context };
    helper.params.forEach((param, i) => {
      try {
        local[param] = value(supplied[i], context);
      } catch {
        /* Visibility predicate. */
      }
    });
    // Vibe's position helper builds a string array and appends varargs.
    const arrayItems = [
      ...helper.body.matchAll(/values\[\d+\]\s*=\s*("(?:\\.|[^"\\])*")/g),
    ].map((x) => value(x[1], context));
    if (arrayItems.length)
      local.values = [
        ...arrayItems,
        ...supplied.slice(helper.params.length - 1).flatMap((x) => {
          try {
            return [].concat(value(x, context));
          } catch {
            return [];
          }
        }),
      ];
    const returned = helper.body.match(
      /return\s+(?:addSetting\()?\s*(new\s+\w+Setting[\s\S]*)/,
    );
    if (!returned) throw new Error(`Unsupported factory: ${call[1]}`);
    return parseExpression(returned[1], local, variable);
  }
  // Assignment expressions cover both field and constructor registrations.
  for (const m of source.matchAll(/\baddSetting\s*\(/g)) {
    const variable = source
      .slice(Math.max(0, m.index - 100), m.index)
      .match(/(\w+)\s*=\s*$/)?.[1];
    const call = enclosed(source, m.index + m[0].length - 1);
    output.push(parseExpression(call.text, env, variable));
  }
  for (const m of source.matchAll(/\b(\w+)\s*=\s*(\w+)\s*\(/g)) {
    if (!helpers[m[2]]) continue;
    const call = enclosed(source, m.index + m[0].length - 1);
    output.push(parseExpression(m[2] + "(" + call.text + ")", env, m[1]));
  }
  for (const [className, body] of Object.entries(inner)) {
    const constructor = body.match(
      new RegExp("(?:private|public|protected)\\s+" + className + "\\s*\\("),
    );
    if (!constructor) continue;
    const params = splitArgs(
      enclosed(body, constructor.index + constructor[0].length - 1).text,
    ).map((x) => x.split(/\s+/).at(-1));
    for (const m of source.matchAll(
      new RegExp("new\\s+" + className + "\\s*\\(", "g"),
    )) {
      const args = splitArgs(enclosed(source, m.index + m[0].length - 1).text),
        context = { ...env };
      params.forEach((name, i) => {
        try {
          context[name] = value(args[i], env);
        } catch {
          /* Visibility predicate. */
        }
      });
      output.push(...readSettings(body, context, helpers));
    }
  }
  return output;
}

export function parseClient(sources, metadata = {}) {
  const entry = (name) =>
    Object.entries(sources).find(([path]) =>
      path.endsWith("/" + name + ".java"),
    )?.[1];
  const manager = stripComments(entry("ModuleManager") || "");
  const registered = [
    ...manager.matchAll(/register\(new\s+([\w.]+)\s*\(/g),
  ].map((m) => m[1].split(".").at(-1));
  if (!registered.length) throw new Error("Module registry not found");
  const categories = [
    ...stripComments(entry("Category") || "").matchAll(
      /\b([A-Z_]+)\s*\(\s*"([^"]+)"\s*\)/g,
    ),
  ].map((m) => ({ id: m[1], name: m[2] }));
  const allConstants = Object.values(sources).reduce(
    (env, source) => constants(stripComments(source), env),
    {},
  );
  const modules = registered.map((className) => {
    const original = entry(className);
    if (!original) throw new Error(`Missing module source: ${className}`);
    const source = stripComments(original),
      env = constants(source, allConstants);
    const declaration = source.match(
      new RegExp("class\\s+" + className + "\\s+extends\\s+(\\w+)[^{]*\\{"),
    );
    if (!declaration) throw new Error(`Unknown module structure: ${className}`);
    const body = enclosed(
      source,
      declaration.index + declaration[0].length - 1,
      "{",
      "}",
    ).text;
    const superCall = body.match(/\bsuper\s*\(/);
    if (!superCall) throw new Error(`Missing module constructor: ${className}`);
    const args = splitArgs(
      enclosed(body, superCall.index + superCall[0].length - 1).text,
    );
    const parent =
      declaration[1] === "Module"
        ? ""
        : stripComments(entry(declaration[1]) || "");
    const category =
      args.find((x) => /^Category\./.test(x))?.split(".")[1] ||
      parent.match(/Category\.(\w+)/)?.[1];
    if (!categories.some((x) => x.id === category))
      throw new Error(`Unknown category: ${className}`);
    const settings = readSettings(body, env);
    if (new Set(settings.map((x) => x.name)).size !== settings.length)
      throw new Error(`Duplicate settings in ${className}`);
    const ctor = body.match(
      new RegExp("public\\s+" + className + "\\s*\\([^)]*\\)\\s*\\{"),
    );
    const ctorBody = ctor
      ? enclosed(body, ctor.index + ctor[0].length - 1, "{", "}").text
      : "";
    return {
      id: className,
      name: value(args[0], env),
      description: value(args[1], env),
      category,
      key:
        args
          .find((x) => x.startsWith("Keyboard.KEY_"))
          ?.replace("Keyboard.KEY_", "") || "NONE",
      enabled: /setEnabled\(true\)/.test(ctorBody),
      settings,
      source: Object.keys(sources).find((path) =>
        path.endsWith("/" + className + ".java"),
      ),
    };
  });
  const hud = modules
    .find((m) => m.id === "HudModule")
    ?.settings.find((s) => s.variable === "arrayListModules");
  if (hud) {
    const extra = modules
      .map((m) => m.name)
      .filter((name) => !hud.options.includes(name));
    hud.options.push(...extra);
    hud.default.push(...extra);
  }
  return {
    schemaVersion: 1,
    ...metadata,
    version: entry("Vibe")?.match(/VERSION\s*=\s*"([^"]+)"/)?.[1] || "dev",
    categories,
    modules,
    settingCount: modules.reduce((sum, m) => sum + m.settings.length, 0),
  };
}
