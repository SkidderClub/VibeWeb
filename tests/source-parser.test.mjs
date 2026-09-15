import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseClient, splitArgs, stripComments } from "../js/source-parser.js";
import { pickJar, parseReview } from "../js/github.js";

const fixture = (module) => ({
  "src/module/ModuleManager.java":
    "class ModuleManager { ModuleManager() { register(new SampleModule()); } }",
  "src/module/Category.java":
    'enum Category { COMBAT("Combat"), VISUAL("Visual"); }',
  "src/Vibe.java":
    'class Vibe { public static final String VERSION = "test"; }',
  "src/module/SampleModule.java": `public class SampleModule extends Module { ${module} public SampleModule() { super("Sample", "A sample", Category.COMBAT, Keyboard.KEY_NONE); } }`,
});

test("source reader handles nested calls, comments, and quoted commas without executing code", () => {
  assert.deepEqual(
    splitArgs('"a,b", Arrays.asList("a", "b"), () -> mode.is("x")'),
    ['"a,b"', 'Arrays.asList("a", "b")', '() -> mode.is("x")'],
  );
  assert.match(
    stripComments('"https://example.com" // ignored'),
    /https:\/\/example.com/,
  );
  const data = parseClient(
    fixture(
      'private final StringSetting name = addSetting(new StringSetting("Text", "hello, world", 24, () -> true));',
    ),
  );
  assert.equal(data.modules[0].settings[0].default, "hello, world");
  assert.equal(data.modules[0].settings[0].maxLength, 24);
});

test("source reader expands factories and nested profile settings", () => {
  const data = parseClient(
    fixture(`
    private final Profile p = new Profile("Friends", 0xD8FF00FF);
    private final ColorSetting accent = color("Accent", "Circle", 0xFFFF55FF);
    private ColorSetting color(String name, final String mode, int value) { return addSetting(new ColorSetting(name, value, () -> true)); }
    public final class Profile {
      private Profile(String prefix, int color) {
        fill = addSetting(new ColorSetting(prefix + " Fill", (color & 0x00FFFFFF) | 0x34000000));
        enabled = addSetting(new BooleanSetting(prefix + " Enabled", true));
      }
    }
  `),
  );
  const settings = data.modules[0].settings;
  assert.equal(settings.length, 3);
  assert.equal(settings.find((s) => s.name === "Friends Fill").alpha, 52);
  assert.equal(
    settings.find((s) => s.name === "Friends Fill").default,
    "#ff00ff",
  );
  assert.equal(settings.find((s) => s.name === "Accent").default, "#ff55ff");
});

test("ranges, mode overloads, collections, and conditional controls retain real values", () => {
  const data = parseClient(
    fixture(`
    private final RangeSetting reach = addSetting(new RangeSetting("Reach", 3.0D, 4.0D, 1.0D, 6.5D, .05D));
    private final ModeSetting mode = addSetting(new ModeSetting("Mode", "A", () -> active.isEnabled(), "A", "B"));
    private final MultiSelectSetting choices = addSetting(new MultiSelectSetting("Targets", Arrays.asList("Players", "Mobs"), Collections.singletonList("Players")));
  `),
  );
  const [range, mode, choices] = data.modules[0].settings;
  assert.deepEqual(range.default, [3, 4]);
  assert.equal(range.step, 0.05);
  assert.equal(range.max, 6.5);
  assert.deepEqual(mode.options, ["A", "B"]);
  assert.equal(mode.condition, "active.isEnabled()");
  assert.deepEqual(choices.options, ["Players", "Mobs"]);
  assert.deepEqual(choices.default, ["Players"]);
});

test("unsupported changes fail instead of publishing an incomplete snapshot", () => {
  assert.throws(
    () =>
      parseClient(
        fixture(
          'private final NumberSetting value = addSetting(new NumberSetting("Speed", unknown(), 0, 10, 1));',
        ),
      ),
    /Unresolved Java value/,
  );
  assert.throws(
    () =>
      parseClient(
        fixture(
          'private final FancySetting value = addSetting(new FancySetting("Fancy", true));',
        ),
      ),
    /Unsupported setting/,
  );
  assert.throws(
    () =>
      parseClient({
        ...fixture(""),
        "src/module/ModuleManager.java": "register(new MissingModule());",
      }),
    /Missing module/,
  );
});

test("the bundled snapshot has complete usable controls across every category", async () => {
  const data = JSON.parse(
    await readFile(new URL("../data/client.json", import.meta.url), "utf8"),
  );
  assert.match(data.sha, /^[a-f0-9]{40}$/);
  assert.ok(data.modules.length > 0);
  assert.ok(data.settingCount > 0);
  assert.equal(
    new Set(data.modules.map((module) => module.id)).size,
    data.modules.length,
  );
  assert.equal(
    data.settingCount,
    data.modules.reduce((n, m) => n + m.settings.length, 0),
  );
  for (const module of data.modules)
    assert.ok(data.categories.some((category) => category.id === module.category));
  for (const module of data.modules)
    for (const setting of module.settings) {
      assert.ok(setting.name);
      if (setting.type === "number" || setting.type === "range") {
        for (const n of [].concat(setting.default))
          assert.ok(
            n >= setting.min && n <= setting.max,
            module.name + ": " + setting.name,
          );
      }
      if (setting.type === "mode")
        assert.ok(setting.options.includes(setting.default));
      if (setting.type === "multiselect")
        assert.ok(setting.default.every((x) => setting.options.includes(x)));
      if (setting.type === "color") {
        assert.match(setting.default, /^#[a-f0-9]{6}$/);
        assert.ok(setting.alpha >= 0 && setting.alpha <= 255);
      }
    }
  // Do not freeze module names or counts: upstream may legitimately remove or
  // rename them. Nested profile behavior is checked by the dedicated fixture.
});

test("download selection skips prereleases and source archives and finds previous usable release", () => {
  const jar = {
    name: "Vibe-1.8.9.jar",
    browser_download_url:
      "https://github.com/SkidderClub/Vibe/releases/download/v1/Vibe.jar",
  };
  const selected = pickJar([
    { prerelease: true, assets: [jar] },
    { assets: [] },
    { tag_name: "v1", assets: [{ name: "Vibe-sources.jar" }, jar] },
  ]);
  assert.equal(selected.version, "v1");
  assert.equal(selected.name, jar.name);
  assert.equal(pickJar([{ assets: [] }]), null);
  assert.equal(
    pickJar([
      {
        assets: [
          {
            ...jar,
            browser_download_url: "https://untrusted.example/download.jar",
          },
        ],
      },
    ]),
    null,
  );
});

test("only structured, moderated GitHub reviews are published", () => {
  const issue = {
    labels: [{ name: "vibe-review" }],
    body: "Rating: 4/5\n\n### Review\nA useful client with a lovely interface.\n\n### Client version\n0.0.5",
    html_url: "https://github.com/SkidderClub/Vibe/issues/1",
    user: { login: "player" },
  };
  assert.equal(parseReview(issue).rating, 4);
  assert.equal(
    parseReview(issue).text,
    "A useful client with a lovely interface.",
  );
  assert.equal(parseReview({ ...issue, labels: [] }), null);
  assert.equal(parseReview({ ...issue, pull_request: {} }), null);
  assert.equal(
    parseReview({
      ...issue,
      body: "Rating: 9/5\n\n### Review\nFake rating pretending to be valid.",
    }),
    null,
  );
});
