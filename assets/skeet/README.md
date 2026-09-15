# Skeet asset sources

The category icons in `icons/` are copied unchanged from [SkidderClub/Vibe](https://github.com/SkidderClub/Vibe/tree/1c10b9d/src/main/resources/assets/minecraft/client/icons), commit `1c10b9d`.

`js/skeet.js` and `css/updates.css` port the geometry and colors from `VibeClickGui.java`: `drawSkeet`, `drawSkeetModule`, `drawSkeetCategoryIcon`, `drawSettingAt`, and `drawSkeetAccentLine`. The original virtual board is 380 × 355 Minecraft GUI pixels, with a 5-pixel top edge, a 50-pixel sidebar, 32-pixel icons, 15-pixel module rows, and 5-pixel gaps. Both website previews share this renderer.

The website uses accessible HTML inputs for editing values. The color selector opens the browser's native color editor from a compact in-panel popup. These controls run only a local simulation.

`assets/fonts/vibe-minecraft.otf` contains vector outlines of the original Minecraft 1.8.9 ASCII bitmap glyphs, with the original character advances. Source: `assets/minecraft/textures/font/ascii.png` in the [official Minecraft 1.8.9 client archive](https://launcher.mojang.com/v1/objects/3870888a6c3d349d3771a3e9d16c9bf5e076b908/client.jar), published through Mojang's version manifest. Minecraft assets are owned by Mojang/Microsoft.

`assets/reviews/heisthack.jpg` is the channel profile image provided by the public metadata of [@heisthacksjp on YouTube](https://www.youtube.com/@heisthacksjp), retrieved for the owner-supplied @heisthack reviews. It is bundled locally so the website does not depend on cross-site image requests.
