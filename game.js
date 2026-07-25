import { CHARACTERS, CROC_VARIANTS, iconPath } from "./characters.js";
import { isFirebaseConfigured, submitScoreToLeaderboard } from "./leaderboard-db.js";

// ============================================================================
//  CONSTANTS
// ============================================================================
const CANVAS_W = 900;
const CANVAS_H = 420;
const GROUND_Y = 300;           // baseline every platform tile sits on
const PLAYER_SCREEN_X = 170;    // player stays fixed here; world scrolls past
const PLAYER_W = 66;
const PLAYER_H = 66;
const PLAYER_HALF_W = PLAYER_W / 2;

const GRAVITY = 2400;           // px/s^2
const JUMP_VELOCITY = 500;      // px/s
const OBSTACLE_CLEAR_HEIGHT = 22; // must be airborne above this to clear an obstacle
const OBSTACLE_H = 22;

const PPM = 40;                 // pixels per "meter"
const BASE_SPEED = 260;         // px/s at the start
const MAX_SPEED = 520;          // px/s cap
const SPEED_PER_METER = 0.18;   // how quickly speed ramps with distance

const GATE_DISTANCE_M = 2500;   // the "goal" of the game
const GATE_BONUS = 250;

const OBSTACLE_EMOJIS = ["🪨", "🕸️", "🦂", "🔥", "🐝"];

// canvas text doesn't reliably fall back to a color-emoji font on its own the
// way regular HTML text does, so every emoji-bearing ctx.font must list one
// explicitly or the glyphs silently render blank on some systems/browsers.
const EMOJI_FONT_STACK = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";

const HISTORY_KEY = "capyKingdomRush_history";
const LAST_NAME_KEY = "capyKingdomRush_lastName";
const LAST_CHAR_KEY = "capyKingdomRush_lastChar";
const HISTORY_MAX = 50;

// ============================================================================
//  DOM
// ============================================================================
const screenMenu = document.getElementById("screen-menu");
const screenGame = document.getElementById("screen-game");
const speciesGrid = document.getElementById("speciesGrid");
const variantRow = document.getElementById("variantRow");
const playerNameInput = document.getElementById("playerNameInput");
const startBtn = document.getElementById("startBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");
const howToPlayBtn = document.getElementById("howToPlayBtn");
const howToPlayOverlay = document.getElementById("howToPlayOverlay");
const closeHowToPlayBtn = document.getElementById("closeHowToPlayBtn");
const gotItBtn = document.getElementById("gotItBtn");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const hudDistance = document.getElementById("hudDistance");
const hudSpeed = document.getElementById("hudSpeed");
const hudScore = document.getElementById("hudScore");
const gateLabel = document.getElementById("gateLabel");
const gateBarFill = document.getElementById("gateBarFill");
const tipToast = document.getElementById("tipToast");

const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverTitle = document.getElementById("gameOverTitle");
const gameOverReason = document.getElementById("gameOverReason");
const statScore = document.getElementById("statScore");
const statDistance = document.getElementById("statDistance");
const statSpeed = document.getElementById("statSpeed");
const statTime = document.getElementById("statTime");
const compareBox = document.getElementById("compareBox");
const personalList = document.getElementById("personalList");
const renameInput = document.getElementById("rename-input");
const submitChk = document.getElementById("submitToLeaderboardChk");
const firebaseNote = document.getElementById("firebaseNote");
const submitScoreBtn = document.getElementById("submitScoreBtn");
const submitStatus = document.getElementById("submitStatus");
const playAgainBtn = document.getElementById("playAgainBtn");
const viewLeaderboardBtn = document.getElementById("viewLeaderboardBtn");
const changeHopperBtn = document.getElementById("changeHopperBtn");
const closeModalBtn = document.getElementById("closeModalBtn");

// ============================================================================
//  CHARACTER SELECT UI
// ============================================================================
let selection = { species: "capybara", icon: CHARACTERS.capybara.defaultIcon };

function loadSavedSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_CHAR_KEY) || "null");
    if (saved && CHARACTERS[saved.species]) {
      selection = saved;
    }
  } catch (e) { /* ignore */ }
  const savedName = localStorage.getItem(LAST_NAME_KEY);
  if (savedName) playerNameInput.value = savedName;
}

function buildSpeciesGrid() {
  speciesGrid.innerHTML = "";
  Object.entries(CHARACTERS).forEach(([key, data]) => {
    const card = document.createElement("div");
    card.className = "species-card" + (selection.species === key ? " selected" : "");
    card.innerHTML = `
      <img src="${iconPath(key, data.defaultIcon)}" alt="${data.label}" />
      <h3>${data.emoji} ${data.label}</h3>
      <div class="tag">tap to pick</div>
    `;
    card.addEventListener("click", () => {
      selection = { species: key, icon: data.defaultIcon };
      buildSpeciesGrid();
      buildVariantRow();
    });
    speciesGrid.appendChild(card);
  });
}

function buildVariantRow() {
  variantRow.innerHTML = "";
  const data = CHARACTERS[selection.species];
  data.variants.forEach((file) => {
    const thumb = document.createElement("div");
    thumb.className = "variant-thumb" + (selection.icon === file ? " selected" : "");
    thumb.innerHTML = `<img src="${iconPath(selection.species, file)}" alt="variant" />`;
    thumb.addEventListener("click", () => {
      selection = { species: selection.species, icon: file };
      buildVariantRow();
    });
    variantRow.appendChild(thumb);
  });
}

loadSavedSelection();
buildSpeciesGrid();
buildVariantRow();

// ============================================================================
//  IMAGE PRELOADING
// ============================================================================
const crocImages = CROC_VARIANTS.map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

// a few capybara/panda character-select images reused as background friends
// lounging on the hills, mixed in with the plain emoji so the background has
// real art alongside them, not just glyphs
const BG_CRITTER_SPECS = [
  { species: "capybara", file: "capy1-removebg-preview.png" },
  { species: "panda", file: "panda1-removebg-preview.png" },
  { species: "capybara", file: "capy4-removebg-preview.png" },
  { species: "panda", file: "panda4-removebg-preview.png" },
];
const bgCritterImages = BG_CRITTER_SPECS.map(({ species, file }) => {
  const img = new Image();
  img.src = iconPath(species, file);
  return img;
});

let playerImage = new Image();
function setPlayerImage() {
  playerImage = new Image();
  playerImage.src = iconPath(selection.species, selection.icon);
}

// ============================================================================
//  RUN STATE
// ============================================================================
let scrollX = 0;
let speed = BASE_SPEED;
let jumpHeight = 0;
let velocity = 0;
let grounded = true;
let wasJumping = false;
let tiles = [];
let nextTileStart = 0;
let elapsed = 0;
let bonusScore = 0;
let gateCrossed = false;
let running = false;
let rafId = null;
let lastTs = 0;
let particles = [];
let toastTimer = null;
let milestoneShown = new Set();

function seedTiles() {
  tiles = [];
  nextTileStart = 0;
  // long safe starting platform (gives the player time to read the "get ready" toast)
  tiles.push({ startX: 0, width: 900, type: "bamboo", crocIdx: 0, obstacle: null });
  nextTileStart = 900;
  while (nextTileStart < CANVAS_W * 2) {
    nextTileStart = spawnTile(nextTileStart);
  }
}

function spawnTile(afterX) {
  const airTime = (2 * JUMP_VELOCITY) / GRAVITY;
  const jumpRange = speed * airTime;
  const gapMax = Math.max(30, Math.min(150, jumpRange * 0.4));
  const gap = Math.random() < 0.5 ? 20 + Math.random() * (gapMax - 20) : 0;
  const type = Math.random() < 0.55 ? "croc" : "bamboo";
  const width = type === "croc" ? 220 + Math.random() * 160 : 160 + Math.random() * 130;
  const startX = afterX + gap;

  const distanceMeters = scrollX / PPM;
  const obstacleChance = Math.min(0.22, 0.05 + distanceMeters / 14000);
  let obstacle = null;
  if (Math.random() < obstacleChance) {
    // keep obstacles well clear of both tile edges. Too close to the leading
    // edge and a player who just landed from crossing the prior gap has no
    // real reaction time before needing to jump again; too close to the
    // trailing edge and clearing the obstacle forces a single jump that must
    // also carry all the way across the next gap. Scale the margin with
    // speed so it always covers a real ~0.3s reaction window.
    const edgeMargin = Math.max(90, speed * 0.3);
    const w = OBSTACLE_H;
    const maxOffset = width - edgeMargin - w;
    if (maxOffset > edgeMargin) {
      const offsetX = edgeMargin + Math.random() * (maxOffset - edgeMargin);
      obstacle = { emoji: OBSTACLE_EMOJIS[Math.floor(Math.random() * OBSTACLE_EMOJIS.length)], offsetX, w };
    }
  }

  tiles.push({
    startX,
    width,
    type,
    crocIdx: Math.floor(Math.random() * crocImages.length),
    obstacle,
  });
  return startX + width;
}

function getTileAtWorldX(x) {
  for (const t of tiles) {
    if (x >= t.startX && x < t.startX + t.width) return t;
  }
  return null;
}

// ============================================================================
//  SCORE HELPERS
// ============================================================================
function distanceMeters() {
  return scrollX / PPM;
}
function speedMps() {
  return speed / PPM;
}
function liveScore() {
  return Math.round(distanceMeters() * 10 + speedMps() * 3 + bonusScore);
}

// ============================================================================
//  GAME LOOP
// ============================================================================
function startRun() {
  setPlayerImage();
  scrollX = 0;
  speed = BASE_SPEED;
  jumpHeight = 0;
  velocity = 0;
  grounded = true;
  wasJumping = false;
  elapsed = 0;
  bonusScore = 0;
  gateCrossed = false;
  particles = [];
  milestoneShown = new Set();
  seedTiles();
  running = true;
  lastTs = 0;
  showToast("🐾 Get ready...", 1200);
  setTimeout(() => showToast("GO! 🚀", 900), 1200);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function loop(ts) {
  if (!running) return;
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  dt = Math.min(dt, 0.05);
  lastTs = ts;

  update(dt);
  render();

  rafId = requestAnimationFrame(loop);
}

function update(dt) {
  elapsed += dt;

  // difficulty ramp
  const targetSpeed = BASE_SPEED + distanceMeters() * SPEED_PER_METER;
  speed = Math.min(MAX_SPEED, targetSpeed);

  scrollX += speed * dt;

  // physics
  velocity -= GRAVITY * dt;
  jumpHeight += velocity * dt;

  // spawn / cleanup tiles
  while (nextTileStart < scrollX + CANVAS_W * 1.5) {
    nextTileStart = spawnTile(nextTileStart);
  }
  while (tiles.length && tiles[0].startX + tiles[0].width < scrollX - 300) {
    tiles.shift();
  }

  checkCollisions();
  updateParticles(dt);
  checkMilestones();
  updateHud();
}

function checkCollisions() {
  const centerX = scrollX + PLAYER_SCREEN_X + PLAYER_HALF_W;
  const tile = getTileAtWorldX(centerX);

  if (jumpHeight <= 0) {
    // require both feet to be over solid ground, not just the center point —
    // a center-only check let up to half the sprite hang visibly over water
    // at a platform's edge while still counting as "grounded"
    const footHalfW = PLAYER_HALF_W * 0.6;
    const leftFoot = getTileAtWorldX(centerX - footHalfW);
    const rightFoot = getTileAtWorldX(centerX + footHalfW);
    if (!tile || !leftFoot || !rightFoot) {
      endGame("water");
      return;
    }
    if (!grounded && wasJumping) {
      spawnParticle("✨");
      bonusScore += 8;
      wasJumping = false;
    }
    jumpHeight = 0;
    velocity = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  if (tile && tile.obstacle && jumpHeight < OBSTACLE_CLEAR_HEIGHT) {
    const obX0 = tile.startX + tile.obstacle.offsetX;
    const obX1 = obX0 + tile.obstacle.w;
    const pLeft = centerX - PLAYER_HALF_W * 0.45;
    const pRight = centerX + PLAYER_HALF_W * 0.45;
    if (pRight > obX0 && pLeft < obX1) {
      endGame("obstacle", tile.obstacle.emoji);
    }
  }
}

function jump() {
  if (!running) return;
  if (grounded) {
    velocity = JUMP_VELOCITY;
    grounded = false;
    wasJumping = true;
  }
}

function spawnParticle(text) {
  particles.push({
    x: PLAYER_SCREEN_X + PLAYER_HALF_W,
    y: GROUND_Y - jumpHeight - PLAYER_H,
    vy: -40,
    life: 1,
    text,
  });
}

function updateParticles(dt) {
  particles.forEach((p) => {
    p.y += p.vy * dt;
    p.life -= dt * 1.2;
  });
  particles = particles.filter((p) => p.life > 0);
}

const MILESTONE_MESSAGES = [
  "500m! You're on a roll! 🎉",
  "1000m! Halfway to the Gate! 🐊",
  "1500m! Legendary hopping! ⚡",
  "2000m! Almost there! 🌟",
];
function checkMilestones() {
  const d = distanceMeters();
  [500, 1000, 1500, 2000].forEach((m, i) => {
    if (d >= m && !milestoneShown.has(m)) {
      milestoneShown.add(m);
      showToast(MILESTONE_MESSAGES[i], 1800);
    }
  });
  if (!gateCrossed && d >= GATE_DISTANCE_M) {
    gateCrossed = true;
    bonusScore += GATE_BONUS;
    showToast("🎉🏯 You reached the Gate of Capyanda Kingdom! Legendary Hopper! 🌟", 3000);
  }
}

function showToast(msg, duration) {
  tipToast.textContent = msg;
  tipToast.style.opacity = "1";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    tipToast.style.opacity = "0";
  }, duration);
}

function updateHud() {
  hudDistance.textContent = Math.floor(distanceMeters());
  hudSpeed.textContent = speedMps().toFixed(1);
  hudScore.textContent = liveScore();
  const pct = Math.min(100, (distanceMeters() / GATE_DISTANCE_M) * 100);
  gateBarFill.style.width = pct + "%";
  gateLabel.textContent = gateCrossed
    ? "🏯 Gate reached! Legendary Hopper 🌟"
    : `🏯 Gate of Capyanda Kingdom: ${Math.floor(distanceMeters())} / ${GATE_DISTANCE_M}m`;
}

// ============================================================================
//  RENDER
// ============================================================================
function render() {
  drawBackground();
  drawWater();
  drawTiles();
  drawParticles();
  drawPlayer();
}

// hill row mixes real capybara/panda art in with the plain emoji so the
// background isn't just glyphs; each image entry falls back to its emoji
// until the picture finishes loading
const BG_HILL_ITEMS = [
  "🦫",
  { img: bgCritterImages[0], fallback: CHARACTERS.capybara.emoji },
  "🐼",
  { img: bgCritterImages[1], fallback: CHARACTERS.panda.emoji },
  "🦫",
  { img: bgCritterImages[2], fallback: CHARACTERS.capybara.emoji },
  "🐼",
  { img: bgCritterImages[3], fallback: CHARACTERS.panda.emoji },
];
const BG_SKY_EMOJIS = ["🦋", "🍃", "🌸", "🐦", "🌺", "🍀"];

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, "#8fe3ff");
  g.addColorStop(0.6, "#c9ecff");
  g.addColorStop(1, "#eafff2");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);

  // parallax hills
  ctx.fillStyle = "#8fe0b0";
  const hillOffset = (scrollX * 0.25) % 300;
  for (let x = -hillOffset - 300; x < CANVAS_W + 300; x += 300) {
    ctx.beginPath();
    ctx.ellipse(x + 150, GROUND_Y - 10, 180, 60, 0, Math.PI, 0);
    ctx.fill();
  }

  // capybara & panda friends lounging on the hills
  drawDecorRow(BG_HILL_ITEMS, 0.25, 230, GROUND_Y - 40, 14, `26px ${EMOJI_FONT_STACK}`, 0.95);

  // parallax clouds
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const cloudOffset = (scrollX * 0.08) % 400;
  for (let x = -cloudOffset - 400; x < CANVAS_W + 400; x += 400) {
    drawCloud(x + 80, 60);
    drawCloud(x + 260, 110);
  }

  // fluttering nature emoji drifting through the sky
  drawDecorRow(BG_SKY_EMOJIS, 0.13, 190, 95, 90, `22px ${EMOJI_FONT_STACK}`, 0.8);
}

// deterministic per-slot decoration: same world position always renders the same
// item/y-offset, so nothing jitters or reshuffles frame to frame as it scrolls by.
// items may be plain emoji strings or {img, fallback} picture entries.
function drawDecorRow(items, parallax, spacing, baseY, yJitter, font, alpha) {
  ctx.save();
  ctx.font = font;
  ctx.globalAlpha = alpha;
  const offset = (scrollX * parallax) % spacing;
  for (let x = -offset - spacing; x < CANVAS_W + spacing; x += spacing) {
    const slot = Math.round((x + offset) / spacing);
    const seed = Math.sin(slot * 12.9898) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const item = items[Math.abs(slot) % items.length];
    const y = baseY + (frac - 0.5) * yJitter;
    drawDecorItem(item, x, y);
  }
  ctx.restore();
}

function drawDecorItem(item, x, y) {
  if (typeof item === "string") {
    ctx.fillText(item, x, y);
    return;
  }
  const img = item.img;
  if (img.complete && img.naturalWidth) {
    const dh = 46;
    const dw = (img.naturalWidth / img.naturalHeight) * dh;
    ctx.drawImage(img, x, y - dh, dw, dh);
  } else {
    ctx.fillText(item.fallback, x, y);
  }
}

function drawCloud(x, y) {
  ctx.beginPath();
  ctx.ellipse(x, y, 34, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 26, y + 6, 26, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 26, y + 8, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWater() {
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
  g.addColorStop(0, "#5fd0ea");
  g.addColorStop(1, "#1f8fc0");
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  for (let row = 0; row < 3; row++) {
    const y = GROUND_Y + 14 + row * 22;
    ctx.beginPath();
    for (let x = 0; x <= CANVAS_W; x += 10) {
      const wy = y + Math.sin((x + scrollX * 1.5 + row * 50) * 0.03) * 3;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }

  ctx.font = `20px ${EMOJI_FONT_STACK}`;
  const waveOffset = (scrollX * 0.6) % 260;
  for (let x = -waveOffset; x < CANVAS_W; x += 260) {
    ctx.fillText("🌊", x + 40, GROUND_Y + 70);
  }
}

function drawTiles() {
  for (const t of tiles) {
    const x = t.startX - scrollX;
    if (x + t.width < -20 || x > CANVAS_W + 20) continue;

    if (t.type === "croc") {
      const img = crocImages[t.crocIdx];
      const bob = Math.sin(scrollX * 0.01 + t.startX) * 3;
      const h = 90;
      const w = t.width;
      const topY = GROUND_Y - h / 2 + bob;

      // solid backing spans the full tile so the entire hitbox always reads
      // as safe platform, no matter how much (or little) of it the source
      // art below ends up covering.
      ctx.fillStyle = "#4a8f4a";
      roundRect(x, topY, w, h, 12);
      ctx.fill();

      if (img.complete && img.naturalWidth) {
        // fit the whole crocodile within the tile height, preserving its
        // native aspect ratio (no crop). Forcing a "cover" crop to an exact
        // w x h box used to cut portrait/square source art down to a thin
        // sliver of the actual image (looked zoomed in), while wide/landscape
        // art barely got cropped and filled the whole tile (looked oversized)
        // — same box, wildly different results depending on source shape.
        const drawH = h;
        const drawW = Math.min(w, drawH * (img.naturalWidth / img.naturalHeight));
        const dx = x + (w - drawW) / 2;
        ctx.drawImage(img, dx, topY, drawW, drawH);
      }
    } else {
      // bamboo platform
      ctx.fillStyle = "#d9b26a";
      roundRect(x, GROUND_Y, t.width, 40, 10);
      ctx.fill();
      ctx.fillStyle = "#c39a4f";
      roundRect(x, GROUND_Y, t.width, 10, 6);
      ctx.fill();
      ctx.font = `26px ${EMOJI_FONT_STACK}`;
      const count = Math.max(1, Math.floor(t.width / 55));
      for (let i = 0; i < count; i++) {
        ctx.fillText("🎋", x + 10 + i * 55, GROUND_Y - 4);
      }
    }

    if (t.obstacle) {
      const ox = x + t.obstacle.offsetX;
      ctx.font = `24px ${EMOJI_FONT_STACK}`;
      // fillStyle is otherwise whatever was last left on the context (e.g.
      // the blue water gradient from drawWater()) — harmless when the emoji
      // font renders full color, but on systems that fall back to a
      // monochrome glyph it tinted obstacles a random leftover color.
      ctx.fillStyle = "#000";
      ctx.fillText(t.obstacle.emoji, ox, GROUND_Y - 6);
    }
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlayer() {
  const py = GROUND_Y - jumpHeight - PLAYER_H;
  const tilt = Math.max(-0.35, Math.min(0.35, -velocity / 1800));

  // shadow
  const shadowScale = Math.max(0.35, 1 - jumpHeight / 220);
  ctx.fillStyle = "rgba(20,30,20,0.25)";
  ctx.beginPath();
  ctx.ellipse(PLAYER_SCREEN_X + PLAYER_HALF_W, GROUND_Y + 6, 26 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(PLAYER_SCREEN_X + PLAYER_HALF_W, py + PLAYER_H / 2);
  ctx.rotate(tilt);
  if (playerImage.complete && playerImage.naturalWidth) {
    const scale = Math.min(PLAYER_W / playerImage.naturalWidth, PLAYER_H / playerImage.naturalHeight);
    const dw = playerImage.naturalWidth * scale;
    const dh = playerImage.naturalHeight * scale;
    ctx.drawImage(playerImage, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.fillStyle = "#e0a86a";
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_W / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.font = `24px ${EMOJI_FONT_STACK}`;
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  });
}

// ============================================================================
//  GAME OVER
// ============================================================================
const REASON_MESSAGES = {
  water: "💦 Splash! You took a dip in the river.",
  obstacle: (emoji) => `💥 Ouch! You bonked into a ${emoji}.`,
};

function endGame(reason, emoji) {
  if (!running) return;
  running = false;
  if (rafId) cancelAnimationFrame(rafId);

  const finalScore = liveScore();
  const finalDistance = Math.floor(distanceMeters());
  const finalSpeed = Math.round(speedMps() * 10) / 10;
  const finalTime = Math.round(elapsed * 10) / 10;

  gameOverReason.textContent =
    reason === "obstacle" ? REASON_MESSAGES.obstacle(emoji) : REASON_MESSAGES.water;

  statScore.textContent = finalScore;
  statDistance.textContent = finalDistance;
  statSpeed.textContent = finalSpeed;
  statTime.textContent = finalTime;

  const history = loadHistory();
  const record = {
    name: (renameInput.value || playerNameInput.value || "Hopper").trim() || "Hopper",
    species: selection.species,
    icon: selection.icon,
    score: finalScore,
    distance: finalDistance,
    topSpeed: finalSpeed,
    time: finalTime,
    ts: Date.now(),
  };
  history.push(record);
  history.sort((a, b) => b.score - a.score);
  const trimmed = history.slice(0, HISTORY_MAX);
  saveHistory(trimmed);

  renderComparison(trimmed, record);

  renameInput.value = playerNameInput.value || record.name;

  const configured = isFirebaseConfigured();
  submitChk.disabled = !configured;
  submitChk.checked = false;
  submitScoreBtn.disabled = !configured;
  firebaseNote.textContent = configured
    ? ""
    : "🚧 Global leaderboard isn't set up yet — see README.md to connect Firebase.";
  submitStatus.textContent = "";

  gameOverOverlay.hidden = false;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (e) {
    return [];
  }
}
function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function renderComparison(history, record) {
  const rank = history.findIndex((r) => r.ts === record.ts) + 1;
  const isBest = rank === 1;
  if (history.length === 1) {
    compareBox.textContent = "🎉 Nice first hop! Play again to set a personal best.";
  } else if (isBest) {
    compareBox.textContent = `🏆 New personal best! You beat your old record of ${history[1]?.score ?? 0}!`;
  } else {
    compareBox.textContent = `🎯 That's rank #${rank} out of ${history.length} of your runs. Your best is ${history[0].score}!`;
  }

  personalList.innerHTML = "";
  history.slice(0, 5).forEach((r, i) => {
    const li = document.createElement("li");
    if (r.ts === record.ts) li.className = "current";
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    li.innerHTML = `<span>${medal} ${CHARACTERS[r.species]?.emoji || "🐾"} ${r.name}</span><span>⭐ ${r.score}</span>`;
    personalList.appendChild(li);
  });
}

// ============================================================================
//  EVENTS
// ============================================================================
startBtn.addEventListener("click", () => {
  const name = playerNameInput.value.trim() || "CapyHero";
  localStorage.setItem(LAST_NAME_KEY, name);
  localStorage.setItem(LAST_CHAR_KEY, JSON.stringify(selection));
  screenMenu.hidden = true;
  screenGame.hidden = false;
  startRun();
});

howToPlayBtn.addEventListener("click", () => {
  howToPlayOverlay.hidden = false;
});
closeHowToPlayBtn.addEventListener("click", () => {
  howToPlayOverlay.hidden = true;
});
gotItBtn.addEventListener("click", () => {
  howToPlayOverlay.hidden = true;
});

backToMenuBtn.addEventListener("click", () => {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  screenGame.hidden = true;
  screenMenu.hidden = false;
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    if (!screenGame.hidden && gameOverOverlay.hidden) {
      e.preventDefault();
      jump();
    }
  }
});
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  jump();
});

playAgainBtn.addEventListener("click", () => {
  gameOverOverlay.hidden = true;
  startRun();
});

changeHopperBtn.addEventListener("click", () => {
  gameOverOverlay.hidden = true;
  screenGame.hidden = true;
  screenMenu.hidden = false;
});

viewLeaderboardBtn.addEventListener("click", () => {
  window.open("leaderboard.html", "_blank");
});

closeModalBtn.addEventListener("click", () => {
  gameOverOverlay.hidden = true;
  screenGame.hidden = true;
  screenMenu.hidden = false;
});

submitScoreBtn.addEventListener("click", async () => {
  if (!submitChk.checked) {
    submitStatus.textContent = "☝️ Check the box above first if you'd like to join the global leaderboard!";
    return;
  }
  submitScoreBtn.disabled = true;
  submitStatus.textContent = "📡 Submitting...";
  const name = renameInput.value.trim() || "Hopper";
  localStorage.setItem(LAST_NAME_KEY, name);
  const result = await submitScoreToLeaderboard({
    name,
    score: Number(statScore.textContent),
    distance: Number(statDistance.textContent),
    topSpeed: Number(statSpeed.textContent),
    species: selection.species,
    icon: selection.icon,
  });
  submitScoreBtn.disabled = false;
  submitStatus.textContent = result.ok
    ? "✅ Added to the global leaderboard! 🌍"
    : `⚠️ Couldn't submit: ${result.error}`;
});
