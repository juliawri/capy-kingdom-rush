// Shared character + crocodile art data, used by game.js and leaderboard.js
// Drop new PNGs into assets/characters (cutout, transparent background works best)
// and add the filename to the relevant "variants" array to make them selectable.

export const CHARACTERS = {
  capybara: {
    label: "Capybara",
    emoji: "🦫",
    folder: "assets/characters/",
    defaultIcon: "capy3-removebg-preview.png",
    variants: [
      "capy1-removebg-preview.png",
      "capy2-removebg-preview.png",
      "capy3-removebg-preview.png",
      "capy4-removebg-preview.png",
      "capy5-removebg-preview.png",
      "capy6-removebg-preview.png",
      "capy7-removebg-preview.png",
    ],
  },
  panda: {
    label: "Panda",
    emoji: "🐼",
    folder: "assets/characters/",
    defaultIcon: "panda3-removebg-preview.png",
    variants: [
      "panda1-removebg-preview.png",
      "panda2-removebg-preview.png",
      "panda3-removebg-preview.png",
      "panda4-removebg-preview.png",
      "panda5-removebg-preview.png",
      "panda6-removebg-preview.png",
      "panda7-removebg-preview.png",
    ],
  },
  capyanda: {
    label: "Capyanda",
    emoji: "🌟",
    folder: "assets/characters/",
    defaultIcon: "capyanda3-removebg-preview.png",
    variants: [
      "capyanda1-removebg-preview.png",
      "capyanda2-removebg-preview.png",
      "capyanda3-removebg-preview.png",
    ],
  },
};

// Crocodile-back platform art (randomly picked per platform tile)
export const CROC_VARIANTS = [
  "croc1-removebg-preview.png",
  "croc2-removebg-preview.png",
  "croc3-removebg-preview.png",
  "croc4-removebg-preview.png",
  "croc5-removebg-preview.png",
  "croc6-removebg-preview.png",
].map((f) => "assets/crocs/" + f);

export function iconPath(species, filename) {
  return CHARACTERS[species].folder + filename;
}
