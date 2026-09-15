const palettes = [
  ["Acid", "#c0f66b", "#74ba45"],
  ["Mint", "#78edc4", "#24a89c"],
  ["Arctic", "#8cdfff", "#458bda"],
  ["Lavender", "#c7a1ff", "#8263db"],
  ["Rose", "#ff9fc5", "#d3588f"],
  ["Ember", "#ffa16b", "#d86238"],
  ["Gold", "#f7d774", "#c3953d"],
  ["Crimson", "#ff7783", "#bc344e"],
  ["Neon", "#80ff92", "#20b95c"],
  ["Cyan", "#63edf5", "#249cb2"],
  ["Ocean", "#7cadff", "#3c62dc"],
  ["Violet", "#b789ff", "#7939c8"],
  ["Bubblegum", "#f496e4", "#ae47a0"],
  ["Peach", "#ffc0a2", "#db8b68"],
  ["Solar", "#f4ef81", "#c6af38"],
  ["Coral", "#ff978b", "#db665f"],
  ["Forest", "#98cfa2", "#52865c"],
  ["Teal", "#6ad7c7", "#268c80"],
  ["Ice", "#c0e8ec", "#6b9eaa"],
  ["Lilac", "#d6b8e8", "#9679b8"],
  ["Sakura", "#f3c1d0", "#b783a7"],
  ["Copper", "#deae88", "#aa7453"],
  ["Monochrome", "#d8ddd5", "#91998c"],
  ["Ultraviolet", "#d891ff", "#8268ed"],
];
// Darken the same palette for readable accents against pure white surfaces.
function ink(hex) {
  return (
    "#" +
    hex
      .slice(1)
      .match(/../g)
      .map((channel) =>
        Math.round(parseInt(channel, 16) * 0.43)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export const THEMES = [
  ...palettes.map(([name, accent, secondary]) => ({
    id: name,
    name,
    mode: "dark",
    accent,
    secondary,
    swatch: accent,
  })),
  ...palettes.map(([name, accent, secondary]) => ({
    id: name + " Light",
    name: name + " Light",
    mode: "light",
    accent: ink(accent),
    secondary: ink(secondary),
    swatch: accent,
  })),
  {
    id: "Rainbow",
    name: "Rainbow",
    mode: "rainbow",
    accent: "#c9a1ff",
    secondary: "#6edfff",
    swatch: "#c9a1ff",
  },
];
export function findTheme(id) {
  return THEMES.find((theme) => theme.id === id) || THEMES[0];
}
