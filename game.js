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

const GRAVITY = 1800;           // px/s^2
const JUMP_VELOCITY = 620;      // px/s
const OBSTACLE_CLEAR_HEIGHT = 50; // must be airborne above this to clear an obstacle
const OBSTACLE_H = 34;

const PPM = 40;                 // pixels per "meter"
const BASE_SPEED = 260;         // px/s at the start
const MAX_SPEED = 640;          // px/s cap
const SPEED_PER_METER = 0.35;   // how quickly speed ramps with distance

const GATE_DISTANCE_M = 2500;   // the "goal" of the game
const GATE_BONUS = 250;

const OBSTACLE_EMOJIS = ["🪨", "🕸️", "🦂", "🔥", "🐝"];

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
  const gapMax = Math.max(40, Math.min(220, jumpRange * 0.62));
  const gap = Math.random() < 0.78 ? 30 + Math.random() * (gapMax - 30) : 0;
  const width = 90 + Math.random() * 90;
  const type = Math.random() < 0.55 ? "croc" : "bamboo";
  const startX = afterX + gap;

  const distanceMeters = scrollX / PPM;
  const obstacleChance = Math.min(0.4, 0.1 + distanceMeters / 8000);
  let obstacle = null;
  if (width > 110 && Math.random() < obstacleChance) {
    const w = OBSTACLE_H;
    const offsetX = 24 + Math.random() * Math.max(10, width - 48 - w);
    obstacle = { emoji: OBSTACLE_EMOJIS[Math.floor(Math.random() * OBSTACLE_EMOJIS.length)], offsetX, w };
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
    if (!tile) {
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

  // parallax clouds
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const cloudOffset = (scrollX * 0.08) % 400;
  for (let x = -cloudOffset - 400; x < CANVAS_W + 400; x += 400) {
    drawCloud(x + 80, 60);
    drawCloud(x + 260, 110);
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

  ctx.font = "20px sans-serif";
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
      const h = Math.min(70, t.width * 0.55);
      const w = t.width;
      if (img.complete && img.naturalWidth) {
        const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, x + (w - dw) / 2, GROUND_Y - dh / 2 + bob, dw, dh);
      } else {
        ctx.fillStyle = "#4a8f4a";
        ctx.fillRect(x, GROUND_Y, w, 34);
      }
    } else {
      // bamboo platform
      ctx.fillStyle = "#d9b26a";
      roundRect(x, GROUND_Y, t.width, 40, 10);
      ctx.fill();
      ctx.fillStyle = "#c39a4f";
      roundRect(x, GROUND_Y, t.width, 10, 6);
      ctx.fill();
      ctx.font = "26px sans-serif";
      const count = Math.max(1, Math.floor(t.width / 55));
      for (let i = 0; i < count; i++) {
        ctx.fillText("🎋", x + 10 + i * 55, GROUND_Y - 4);
      }
    }

    if (t.obstacle) {
      const ox = x + t.obstacle.offsetX;
      ctx.font = "30px sans-serif";
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
  ctx.font = "24px sans-serif";
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
