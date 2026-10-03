// Reads setting declarations in Vibe's composed settings groups. This is a
// bounded reader of literals, constructors, and counted loops, never Java eval.
export function readConstructedSettings(
  source,
  rootName,
  supplied,
  namespace,
  api,
  parentColor = null,
) {
  const { value, setting, splitArgs, enclosed } = api;
  const classes = new Map();
  const output = [];
  const count = { elements: 0 };
  const literalEnv = (scope) =>
    Object.fromEntries(
      Object.entries(scope).filter(
        ([, v]) => v === null || typeof v !== "object" || Array.isArray(v),
      ),
    );
  const readValue = (text, scope) => {
    if (text.trim() === "elements.size()") return count.elements;
    return value(text, literalEnv(scope));
  };
  function condition(text, scope) {
    let result = text.trim().replace(/^\(\)\s*->\s*/, "");
    result = result.replace(/\b([\w]+)\.getAsBoolean\(\)/g, (all, key) =>
      scope[key]?.predicate ? `(${scope[key].predicate})` : all,
    );
    result = result.replace(
      /\b([\w]+)\.(isEnabled|is|isSelected|isSelectedIgnoreCase|getInt|getDouble|getValue)\(/g,
      (all, key, method) =>
        scope[key]?.ref ? `${scope[key].ref}.${method}(` : all,
    );
    result = result.replace(/\b([\w]+)\.isVisible\(\)/g, (all, key) =>
      scope[key]?.item ? `(${scope[key].item.condition || "true"})` : all,
    );
    result = result.replace(/\b(kind\s*(?:==|!=)\s*Kind\.\w+)/g, (all) => {
      try {
        return String(readValue(all, scope));
      } catch {
        return all;
      }
    });
    result = result.replace(
      /("(?:\\.|[^"\\])*")\.equals\((\w+)\)/g,
      (all, expected, key) =>
        typeof scope[key] === "string"
          ? String(JSON.parse(expected) === scope[key])
          : all,
    );
    for (const [key, item] of Object.entries(scope)) {
      if (typeof item === "number")
        result = result.replace(
          new RegExp("\\b" + key + "\\b", "g"),
          String(item),
        );
    }
    return result;
  }
  const bind = (text, scope) => {
    if (text.includes("->") || /\.getAsBoolean\(\)/.test(text))
      return { predicate: condition(text, scope) };
    if (Object.hasOwn(scope, text.trim())) return scope[text.trim()];
    try {
      return readValue(text, scope);
    } catch {
      return { predicate: condition(text, scope) };
    }
  };
  function discover(name, body) {
    let own = body;
    const nested = [
      ...body.matchAll(
        /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?class\s+(\w+)[^{]*\{/g,
      ),
    ];
    for (const match of nested.reverse()) {
      const content = enclosed(
        own,
        match.index + match[0].length - 1,
        "{",
        "}",
      );
      discover(match[1], content.text);
      own =
        own.slice(0, match.index) +
        " ".repeat(content.end - match.index) +
        own.slice(content.end);
    }
    const constructors = [];
    for (const match of own.matchAll(
      new RegExp("(?:public|private|protected)\\s+" + name + "\\s*\\(", "g"),
    )) {
      const args = enclosed(own, match.index + match[0].length - 1);
      const brace = own.indexOf("{", args.end);
      const body = enclosed(own, brace, "{", "}");
      constructors.push({
        params: splitArgs(args.text).map((p) => p.trim().split(/\s+/).at(-1)),
        body: body.text,
      });
    }
    const fields = [
      ...own.matchAll(
        /(?:public|private|protected)\s+final\s+\w+Setting\s+\w+\s*=\s*new\s+\w+Setting\s*\(/g,
      ),
    ]
      .map((m) => {
        const call = enclosed(own, m.index + m[0].length - 1);
        return own.slice(m.index, call.end) + ";";
      })
      .join("\n");
    classes.set(name, { constructors, fields, body: own });
  }
  if (parentColor) {
    source = source.replace(
      /getRawName\(\)/g,
      JSON.stringify(parentColor.name),
    );
    source = source.replace(
      /\(\)\s*->\s*isVisible\(\)/g,
      `() -> (${parentColor.condition || "true"})`,
    );
    walk(source, {}, namespace);
    return output;
  }
  const declaration = source.match(
    new RegExp("class\\s+" + rootName + "[^\\{]*\\{"),
  );
  if (!declaration) throw new Error(`Settings class not found: ${rootName}`);
  discover(
    rootName,
    enclosed(source, declaration.index + declaration[0].length - 1, "{", "}")
      .text,
  );

  function instantiate(name, rawArgs, parent, path, depth = 0) {
    if (depth > 12) throw new Error("Settings constructor nesting is too deep");
    const type = classes.get(name);
    if (!type) throw new Error(`Unsupported composed settings: ${name}`);
    let constructor = type.constructors.find(
      (c) => c.params.length === rawArgs.length,
    );
    if (!constructor)
      throw new Error(
        `Settings constructor not found: ${name}/${rawArgs.length}`,
      );
    const bound = rawArgs.map((a) => bind(a, parent));
    const scope = { ...parent };
    constructor.params.forEach((param, i) => {
      scope[param] = bound[i];
    });
    const delegation = constructor.body.match(/^\s*this\s*\(/);
    if (delegation) {
      const args = splitArgs(
        enclosed(constructor.body, delegation[0].length - 1).text,
      );
      constructor = type.constructors.find(
        (c) => c.params.length === args.length,
      );
      if (!constructor)
        throw new Error(`Delegated constructor not found: ${name}`);
      const delegated = args.map((a) => bind(a, scope));
      constructor.params.forEach((param, i) => {
        scope[param] = delegated[i];
      });
    }
    walk(type.fields, scope, path, depth);
    walk(constructor.body, scope, path, depth);
    return { members: scope };
  }
  function emit(type, args, scope, variable) {
    const prepared = args.map((arg) =>
      scope[arg.trim()]?.predicate
        ? `() -> ${scope[arg.trim()].predicate}`
        : arg,
    );
    const item = setting(type, prepared, literalEnv(scope), variable);
    if (item.condition) item.condition = condition(item.condition, scope);
    output.push(item);
    if (output.length > 10000)
      throw new Error("Settings expansion exceeded its limit");
    return { ref: variable, item };
  }
  function statement(text, scope, path, depth) {
    const s = text.trim();
    if (!s || /^this\s*\(/.test(s)) return;
    const update = s.match(/^([\w.]+)\.setValue\s*\(/);
    if (update) {
      let target = { members: scope };
      for (const key of update[1].split(".")) target = target?.members?.[key];
      if (target?.item) {
        const args = splitArgs(enclosed(s, update[0].length - 1).text);
        const fresh = setting(
          target.item.type[0].toUpperCase() +
            target.item.type.slice(1) +
            "Setting",
          [JSON.stringify(target.item.name), args[0]],
          literalEnv(scope),
          target.ref,
        );
        target.item.default = fresh.default;
        if (fresh.alpha !== undefined) target.item.alpha = fresh.alpha;
      }
      return;
    }
    const assignment = s.match(/(?:^|\s)(?:this\.)?([\w.]+)\s*=\s*(?![=>])/);
    const variable = assignment?.[1];
    const rhs = assignment
      ? s.slice(assignment.index + assignment[0].length)
      : s;
    if (
      /^(?:BooleanSupplier|java\.util\.function\.BooleanSupplier)\b/.test(s) &&
      variable
    ) {
      scope[variable] = { predicate: condition(rhs, scope) };
      return;
    }
    const construction = rhs.match(/\bnew\s+([\w.]+)\s*\(/);
    if (construction) {
      const type = construction[1].split(".").at(-1);
      const args = splitArgs(
        enclosed(rhs, construction.index + construction[0].length - 1).text,
      );
      const key =
        path +
        "_" +
        (variable?.replace(/\./g, "_") || type + "_" + output.length);
      if (type.endsWith("Setting")) {
        const item = emit(type, args, scope, key);
        if (variable?.includes(".")) {
          const [owner, field] = variable.split(".");
          if (scope[owner]) {
            scope[owner].members ||= {};
            scope[owner].members[field] = item;
          }
        } else if (variable) scope[variable] = item;
      } else if (classes.has(type)) {
        const instance = instantiate(type, args, scope, key, depth + 1);
        if (variable) scope[variable] = instance;
      } else if (type.endsWith("Settings")) {
        throw new Error(`Missing composed settings class: ${type}`);
      }
      return;
    }
    const element = rhs.match(/^element\s*\(/);
    if (element && variable) {
      const args = splitArgs(enclosed(rhs, element[0].length - 1).text);
      args.push(String(count.elements++));
      scope[variable] = instantiate(
        "Element",
        args,
        scope,
        path + "_" + variable,
        depth + 1,
      );
      return;
    }
    if (variable) {
      try {
        scope[variable] = readValue(rhs, scope);
      } catch {
        /* Runtime-only assignments are outside this reader. */
      }
    }
  }
  function walk(body, scope, path, depth = 0) {
    let cursor = 0;
    while (cursor < body.length) {
      while (/[\s;]/.test(body[cursor] || "") && cursor < body.length) cursor++;
      const loop = body.slice(cursor).match(/^for\s*\(/);
      if (loop) {
        const header = enclosed(body, cursor + loop[0].length - 1);
        const brace = body.indexOf("{", header.end);
        const block = enclosed(body, brace, "{", "}");
        const parts = splitArgs(header.text, ";");
        const start = parts[0]?.match(/(?:int\s+)?(\w+)\s*=\s*(.+)/);
        const stop = parts[1]?.match(/(\w+)\s*<\s*(.+)/);
        if (!start || !stop || start[1] !== stop[1])
          throw new Error("Unsupported settings loop");
        const first = readValue(start[2], scope),
          end = readValue(stop[2], scope);
        if (
          !Number.isInteger(first) ||
          !Number.isInteger(end) ||
          end - first > 64
        )
          throw new Error("Unbounded settings loop");
        for (let i = first; i < end; i++)
          walk(block.text, { ...scope, [start[1]]: i }, path + "_" + i, depth);
        cursor = block.end;
        continue;
      }
      let end = cursor,
        quote = "",
        nesting = 0;
      for (; end < body.length; end++) {
        const c = body[end];
        if (quote) {
          if (c === "\\") end++;
          else if (c === quote) quote = "";
          continue;
        }
        if (c === '"' || c === "'") quote = c;
        else if ("({[".includes(c)) nesting++;
        else if (")}]".includes(c)) nesting--;
        else if (c === ";" && nesting === 0) break;
      }
      statement(body.slice(cursor, end), scope, path, depth);
      cursor = end + 1;
    }
  }
  instantiate(rootName, supplied, {}, namespace);
  return output;
}
