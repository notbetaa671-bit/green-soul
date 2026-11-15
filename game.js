/* GREEN SOUL — original canvas arcade game. No external assets required. */
(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width;
  const H = canvas.height;
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  const levels = [
    { name: "VERDANT GATE", subtitle: "FIRST LIGHT", color: "#74f59d", waves: 3, pattern: "sprout", boss: "THORN SENTINEL", description: "A gentle field with sharp lessons." },
    { name: "MOSSWORKS", subtitle: "RUSTED ROOTS", color: "#65e7c1", waves: 4, pattern: "sweep", boss: "GEARWOOD", description: "The old machines still remember." },
    { name: "ROOT CIRCUIT", subtitle: "DEEP SIGNAL", color: "#83d8ff", waves: 4, pattern: "spiral", boss: "THE CIRCUIT STAG", description: "Follow the pulse beneath the soil." },
    { name: "CANOPY CROWN", subtitle: "UPPER WILD", color: "#f2c777", waves: 5, pattern: "rain", boss: "CROWN OF THORNS", description: "The sky is beautiful. It is not safe." },
    { name: "HEART OF THE GROVE", subtitle: "LAST BLOOM", color: "#ff8fa4", waves: 5, pattern: "finale", boss: "THE HOLLOW BLOOM", description: "Every green soul leads here." }
  ];

  const defaultSettings = { sound: true, reducedMotion: false, highContrast: false };
  const state = {
    mode: "menu",
    runType: "campaign",
    level: 0,
    wave: 0,
    waveTime: 0,
    waveDuration: 10,
    score: 0,
    best: Number(localStorage.getItem("green-soul-best") || 0),
    campaignBest: JSON.parse(localStorage.getItem("green-soul-levels") || "[]"),
    unlocked: Number(localStorage.getItem("green-soul-unlocked") || 1),
    settings: { ...defaultSettings, ...JSON.parse(localStorage.getItem("green-soul-settings") || "{}") },
    time: 0,
    lastTime: 0,
    shake: 0,
    flash: 0,
    message: "",
    messageTime: 0,
    boss: null,
    bossDefeated: false,
    endlessLevel: 1
  };

  const keys = new Set();
  const pointer = { x: W / 2, y: H / 2, down: false, active: false };
  const player = { x: W / 2, y: H - 104, radius: 10, health: 3, maxHealth: 3, aim: -Math.PI / 2, brace: false, invulnerable: 0, energy: 0, trail: [] };
  let projectiles = [];
  let particles = [];
  let stars = [];
  let waveClock = 0;
  let audio = null;

  const $ = (id) => document.getElementById(id);
  const panels = { menu: $("menuPanel"), level: $("levelPanel"), tutorial: $("tutorialPanel"), settings: $("settingsPanel"), pause: $("pausePanel"), gameOver: $("gameOverPanel") };
  const hud = $("hud");

  function saveSettings() {
    localStorage.setItem("green-soul-settings", JSON.stringify(state.settings));
    document.body.classList.toggle("high-contrast", state.settings.highContrast);
  }

  function showPanel(name) {
    Object.values(panels).forEach((panel) => panel.classList.add("is-hidden"));
    if (name) panels[name].classList.remove("is-hidden");
    hud.classList.toggle("is-hidden", name !== null);
  }

  function buildLevelCards() {
    const grid = $("levelCards");
    grid.innerHTML = "";
    levels.forEach((level, index) => {
      const unlocked = index < state.unlocked;
      const cleared = state.campaignBest[index] > 0;
      const card = document.createElement("button");
      card.className = `level-card${unlocked ? "" : " locked"}`;
      card.disabled = !unlocked;
      card.innerHTML = `<span class="level-number">FIELD 0${index + 1}</span><h3>${level.name}</h3><p>${level.description}</p><span class="level-status ${unlocked ? "" : "lock"}">${cleared ? "CLEARED ◆" : unlocked ? "ENTER ↗" : "LOCKED ·"}</span>`;
      if (unlocked) card.addEventListener("click", () => startCampaign(index));
      grid.appendChild(card);
    });
  }

  function updateSettingsUI() {
    $("soundToggle").checked = state.settings.sound;
    $("motionToggle").checked = state.settings.reducedMotion;
    $("contrastToggle").checked = state.settings.highContrast;
    saveSettings();
  }

  class Soundscape {
    constructor() { this.ctx = null; this.master = null; this.timer = null; this.step = 0; }
    start() {
      if (!state.settings.sound) return;
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.055;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (!this.timer) this.timer = setInterval(() => this.tick(), 420);
    }
    stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
    tone(frequency, duration = .08, type = "square", volume = .05) {
      if (!state.settings.sound || !this.ctx || !this.master) return;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + duration);
      oscillator.connect(gain); gain.connect(this.master);
      oscillator.start(); oscillator.stop(this.ctx.currentTime + duration);
    }
    tick() { if (state.mode === "playing") this.tone([196, 247, 294, 370, 294, 247][this.step++ % 6], .12, "triangle", .025); }
  }

  function resetWorld() {
    projectiles = [];
    particles = [];
    stars = Array.from({ length: 78 }, () => ({ x: rand(18, W - 18), y: rand(22, H - 18), size: pick([1, 1, 2, 3]), speed: rand(.15, .8), phase: rand(0, TAU) }));
    player.x = W / 2; player.y = H - 104; player.health = player.maxHealth; player.energy = 0; player.invulnerable = 0; player.trail = [];
    waveClock = 0; state.waveTime = 0; state.boss = null; state.bossDefeated = false; state.shake = 0; state.flash = 0; state.message = "";
  }

  function startCampaign(levelIndex = 0) {
    state.runType = "campaign"; state.level = clamp(levelIndex, 0, levels.length - 1); state.score = 0; state.endlessLevel = 1;
    resetWorld(); state.wave = 0; state.mode = "playing"; showPanel(null); audio.start(); announce(`FIELD 0${state.level + 1} // ${levels[state.level].name}`); startWave(); canvas.focus();
  }

  function startEndless() {
    state.runType = "endless"; state.level = 0; state.score = 0; state.endlessLevel = 1; state.wave = 0;
    resetWorld(); state.mode = "playing"; showPanel(null); audio.start(); announce("ENDLESS SURVIVAL // STAY ALIVE"); startWave(); canvas.focus();
  }

  function restartRun() { state.runType === "endless" ? startEndless() : startCampaign(state.level); }

  function announce(message, duration = 2.2) { state.message = message; state.messageTime = duration; }

  function startWave() {
    waveClock = 0; state.waveTime = 0; projectiles = [];
    const totalWaves = state.runType === "endless" ? 999 : levels[state.level].waves + 1;
    state.waveDuration = state.wave >= totalWaves - 1 ? 16 : 11;
    const bossWave = state.runType === "campaign" && state.wave >= levels[state.level].waves;
    if (bossWave) {
      spawnBoss();
      announce(`GUARDIAN // ${levels[state.level].boss}`, 3);
    } else {
      announce(state.runType === "endless" ? `SURVIVAL CYCLE ${String(state.endlessLevel).padStart(2, "0")}` : `WAVE ${String(state.wave + 1).padStart(2, "0")}`, 1.7);
    }
  }

  function spawnBoss() {
    const names = state.runType === "campaign" ? levels[state.level].boss : "THE HUNGERING VINE";
    state.boss = { name: names, x: W / 2, y: 103, radius: 34 + state.level * 2, hp: 24 + state.level * 14 + state.endlessLevel * 4, maxHp: 24 + state.level * 14 + state.endlessLevel * 4, phase: 0, attackClock: 0, flash: 0 };
    state.waveTime = 0;
  }

  function nextWave() {
    state.wave += 1;
    if (state.runType === "endless") { state.endlessLevel += 1; state.wave = 0; }
    if (state.runType === "campaign" && state.wave > levels[state.level].waves) {
      completeLevel();
      return;
    }
    startWave();
  }

  function completeLevel() {
    state.mode = "result"; state.bossDefeated = true;
    const previous = state.campaignBest[state.level] || 0;
    state.campaignBest[state.level] = Math.max(previous, state.score);
    state.unlocked = Math.max(state.unlocked, Math.min(levels.length, state.level + 2));
    localStorage.setItem("green-soul-levels", JSON.stringify(state.campaignBest));
    localStorage.setItem("green-soul-unlocked", String(state.unlocked));
    finishRun(true);
  }

  function finishRun(victory = false) {
    state.mode = "result";
    if (state.score > state.best) { state.best = state.score; localStorage.setItem("green-soul-best", String(state.best)); }
    $("resultEyebrow").textContent = victory ? "FIELD RESTORED" : "FIELD COLLAPSED";
    $("resultTitle").textContent = victory ? (state.level === levels.length - 1 ? "THE GROVE REMEMBERS" : "A NEW PATH OPENS") : "THE ROOT REMEMBERS";
    $("resultCopy").textContent = victory ? (state.level === levels.length - 1 ? "You carried the green light all the way home." : "The next field is waiting beyond the roots.") : "Every failed run leaves a map behind.";
    $("resultScore").textContent = formatScore(state.score);
    $("resultBest").textContent = formatScore(state.best);
    showPanel("gameOver");
    audio.tone(victory ? 659 : 110, victory ? .35 : .22, victory ? "triangle" : "sawtooth", .08);
  }

  function formatScore(number) { return String(Math.max(0, Math.floor(number))).padStart(6, "0"); }

  function quitRun() { state.mode = "menu"; showPanel("menu"); audio.stop(); buildLevelCards(); }

  function damagePlayer(amount = 1) {
    if (player.invulnerable > 0) return;
    player.health -= amount; player.invulnerable = 1.25; state.flash = .4; state.shake = state.settings.reducedMotion ? 2 : 8; audio.tone(74, .18, "sawtooth", .07);
    burst(player.x, player.y, "#ff6e68", 18, 2.8);
    if (player.health <= 0) finishRun(false);
  }

  function spawnProjectile(x, y, vx, vy, options = {}) {
    projectiles.push({ x, y, vx, vy, radius: options.radius || 5, color: options.color || "#ffd477", life: options.life || 10, damage: options.damage || 1, kind: options.kind || "seed", phase: options.phase || 0, turn: options.turn || 0 });
  }

  function fireAtPlayer(x, y, speed = 90, options = {}) {
    const angle = Math.atan2(player.y - y, player.x - x);
    spawnProjectile(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, options);
  }

  function wavePattern(dt) {
    const level = levels[state.level];
    const cycle = Math.floor(waveClock * 2.3);
    const intensity = state.runType === "endless" ? 1 + state.endlessLevel * .12 : 1 + state.level * .12;
    if (waveClock <= .02) { projectiles = []; }
    if (level.pattern === "sprout") {
      if (cycle % 2 === 0 && Math.abs((waveClock * 2.3) % 1) < dt * 2.4) {
        const side = cycle % 4 === 0 ? 80 : W - 80;
        fireAtPlayer(side, rand(90, 190), 78 * intensity, { color: "#ffd477", radius: 6 });
        fireAtPlayer(W - side, rand(130, 270), 74 * intensity, { color: "#ffad73", radius: 4 });
      }
      if (cycle % 5 === 3 && Math.abs(waveClock % 2) < dt) radialBurst(W / 2, 90, 6, 44 * intensity, { color: "#74f59d", radius: 4 });
    } else if (level.pattern === "sweep") {
      if (Math.abs((waveClock * 1.8) % 1) < dt * 1.8) {
        const fromLeft = cycle % 2 === 0;
        for (let i = 0; i < 5; i++) spawnProjectile(fromLeft ? -10 : W + 10, 125 + i * 52, fromLeft ? 120 * intensity : -120 * intensity, 5 + i * 3, { color: i % 2 ? "#65e7c1" : "#ffd477", radius: 5 });
      }
      if (cycle % 4 === 2 && Math.abs((waveClock * 1.1) % 1) < dt) fireAtPlayer(W / 2, 72, 130 * intensity, { color: "#ff8fa4", radius: 7 });
    } else if (level.pattern === "spiral") {
      if (Math.abs((waveClock * 2) % 1) < dt * 2) {
        const angle = waveClock * 2.2;
        for (let i = 0; i < 2; i++) { const a = angle + i * Math.PI; spawnProjectile(W / 2, 88, Math.cos(a) * 34 * intensity, Math.sin(a) * 34 * intensity + 30, { color: "#83d8ff", radius: 5, kind: "drift", turn: 1.2 }); }
      }
      if (cycle % 3 === 1 && Math.abs(waveClock % 1.4) < dt) radialBurst(rand(130, W - 130), rand(80, 180), 8, 35 * intensity, { color: "#74f59d", radius: 4 });
    } else if (level.pattern === "rain") {
      if (Math.abs((waveClock * 4) % 1) < dt * 4) {
        for (let i = 0; i < 3; i++) spawnProjectile(rand(50, W - 50), 34, rand(-13, 13), 90 * intensity + i * 8, { color: i % 2 ? "#f2c777" : "#ff8fa4", radius: 5, kind: "rain" });
      }
      if (cycle % 5 === 0 && Math.abs(waveClock % 2) < dt) sweepArc(W / 2, 150, 13, 80 * intensity, { color: "#83d8ff" });
    } else {
      if (Math.abs((waveClock * 3) % 1) < dt * 3) radialBurst(W / 2, 112, 9, 54 * intensity, { color: pick(["#ff8fa4", "#74f59d", "#83d8ff"]), radius: 5 });
      if (cycle % 4 === 2 && Math.abs(waveClock % 1.6) < dt) { for (let i = 0; i < 4; i++) fireAtPlayer(120 + i * 240, 50 + i * 22, 105 * intensity, { color: "#ffd477", radius: 6 }); }
    }
  }

  function radialBurst(x, y, count, speed, options = {}) { for (let i = 0; i < count; i++) { const a = i / count * TAU + state.time * .2; spawnProjectile(x, y, Math.cos(a) * speed, Math.sin(a) * speed, options); } }
  function sweepArc(x, y, count, speed, options = {}) { for (let i = 0; i < count; i++) { const a = Math.PI * .1 + i / (count - 1) * Math.PI * .8; spawnProjectile(x, y, Math.cos(a) * speed, Math.sin(a) * speed, options); } }

  function bossPattern(dt) {
    const boss = state.boss; if (!boss) return;
    boss.phase += dt; boss.attackClock += dt;
    const intensity = 1 + (state.level + state.endlessLevel) * .08;
    if (boss.attackClock > Math.max(.45, 1.2 - state.level * .08)) {
      boss.attackClock = 0;
      const phase = Math.floor(boss.phase * 1.4) % 4;
      if (phase === 0) radialBurst(boss.x, boss.y + 12, 8 + state.level, 42 * intensity, { color: "#ff8fa4", radius: 5 });
      if (phase === 1) for (let i = 0; i < 3; i++) fireAtPlayer(boss.x + (i - 1) * 26, boss.y + 25, (100 + i * 20) * intensity, { color: "#ffd477", radius: 7 });
      if (phase === 2) sweepArc(boss.x, boss.y + 12, 12, 56 * intensity, { color: "#83d8ff", radius: 4 });
      if (phase === 3) radialBurst(boss.x, boss.y + 12, 5 + state.level, 72 * intensity, { color: "#74f59d", radius: 4 });
    }
    boss.x = W / 2 + Math.sin(state.time * (.7 + state.level * .1)) * (120 + state.level * 22);
    boss.y = 100 + Math.sin(state.time * 1.3) * 16;
  }

  function update(dt) {
    state.time += dt;
    stars.forEach((star) => { star.phase += dt * star.speed; star.y += dt * star.speed * 1.4; if (star.y > H) star.y = 18; });
    particles.forEach((particle) => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= .98; particle.vy *= .98; particle.life -= dt; particle.rotation += particle.spin * dt; });
    particles = particles.filter((particle) => particle.life > 0);
    if (state.mode !== "playing") return;
    state.waveTime += dt; waveClock += dt; player.invulnerable = Math.max(0, player.invulnerable - dt); state.flash = Math.max(0, state.flash - dt); state.shake = Math.max(0, state.shake - dt * 14); state.messageTime = Math.max(0, state.messageTime - dt);
    updatePlayer(dt);
    const bossWave = state.runType === "campaign" && state.wave >= levels[state.level].waves;
    if (bossWave || (state.runType === "endless" && state.wave >= 3)) bossPattern(dt); else wavePattern(dt);
    projectiles.forEach((bullet) => {
      if (bullet.kind === "drift") { const angle = Math.atan2(bullet.vy, bullet.vx) + bullet.turn * dt; const speed = Math.hypot(bullet.vx, bullet.vy); bullet.vx = Math.cos(angle) * speed; bullet.vy = Math.sin(angle) * speed; }
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
      if (bullet.kind === "rain" && bullet.y > H - 60) burst(bullet.x, H - 40, "#f2c777", 4, 1.2);
    });
    handleCollisions();
    projectiles = projectiles.filter((bullet) => bullet.life > 0 && bullet.x > -40 && bullet.x < W + 40 && bullet.y > -40 && bullet.y < H + 40);
    if (state.boss) {
      if (state.waveTime > state.waveDuration && state.boss.hp <= 0) { state.boss = null; nextWave(); }
    } else if (state.waveTime > state.waveDuration) nextWave();
    updateHud();
  }

  function updatePlayer(dt) {
    let dx = 0; let dy = 0;
    if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
    if (keys.has("arrowright") || keys.has("d")) dx += 1;
    if (keys.has("arrowup") || keys.has("w")) dy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) dy += 1;
    if (pointer.active && pointer.down && isTouchDevice()) { dx += (pointer.x - player.x) * .01; dy += (pointer.y - player.y) * .01; }
    const magnitude = Math.hypot(dx, dy) || 1;
    const speed = keys.has("shift") ? 210 : 155;
    player.x = clamp(player.x + dx / magnitude * speed * dt, 36, W - 36);
    player.y = clamp(player.y + dy / magnitude * speed * dt, 180, H - 38);
    if (pointer.active) player.aim = Math.atan2(pointer.y - player.y, pointer.x - player.x);
    if (keys.has("q")) player.aim -= dt * 2.7;
    if (keys.has("e")) player.aim += dt * 2.7;
    player.brace = keys.has(" ") || pointer.down;
    player.trail.push({ x: player.x, y: player.y, life: 1 }); if (player.trail.length > 10) player.trail.shift();
    player.trail.forEach((point) => point.life -= dt * 3.2);
  }

  function handleCollisions() {
    const shieldAngle = player.aim; const shieldWidth = player.brace ? .72 : .5; const shieldDistance = 36;
    projectiles.forEach((bullet) => {
      if (bullet.dead) return;
      const dx = bullet.x - player.x; const dy = bullet.y - player.y; const distance = Math.hypot(dx, dy);
      if (distance < player.radius + bullet.radius + 2) {
        const incoming = Math.atan2(dy, dx); const angleDelta = Math.atan2(Math.sin(incoming - shieldAngle), Math.cos(incoming - shieldAngle));
        if (Math.abs(angleDelta) < shieldWidth && distance < shieldDistance + 10) {
          bullet.dead = true; const perfect = Math.abs(angleDelta) < shieldWidth * .52; state.score += perfect ? 120 : 35; player.energy = clamp(player.energy + (perfect ? 14 : 6), 0, 100); burst(bullet.x, bullet.y, perfect ? "#b7ffd0" : "#74f59d", perfect ? 10 : 5, perfect ? 2.2 : 1.3); audio.tone(perfect ? 660 : 440, .07, "square", .04); if (perfect) state.shake = 1; return;
        }
        bullet.dead = true; damagePlayer(bullet.damage);
      }
    });
    if (state.boss && state.boss.hp > 0 && player.energy >= 100 && keys.has("enter")) {
      state.boss.hp -= 5; player.energy = 0; state.score += 500; state.boss.flash = .25; burst(state.boss.x, state.boss.y, "#b7ffd0", 22, 3); audio.tone(880, .12, "triangle", .07);
    }
  }

  function burst(x, y, color, count = 10, speed = 2) { for (let i = 0; i < count; i++) { const angle = rand(0, TAU); particles.push({ x, y, vx: Math.cos(angle) * rand(.3, speed), vy: Math.sin(angle) * rand(.3, speed), life: rand(.3, .8), maxLife: .8, size: pick([2, 2, 3, 4]), color, rotation: rand(0, TAU), spin: rand(-4, 4) }); } }

  function updateHud() {
    $("hudHealth").textContent = "♥".repeat(Math.max(0, player.health)) + "♡".repeat(Math.max(0, player.maxHealth - player.health));
    const total = state.runType === "endless" ? `CYCLE ${String(state.endlessLevel).padStart(2, "0")}` : `${String(Math.min(state.wave + 1, levels[state.level].waves + 1)).padStart(2, "0")} / ${String(levels[state.level].waves + 1).padStart(2, "0")}`;
    $("hudWave").textContent = total; $("hudScore").textContent = formatScore(state.score); $("hudBest").textContent = formatScore(state.best);
    $("hudObjective").textContent = state.boss ? `${state.boss.name} // ${Math.max(0, Math.ceil(state.boss.hp))} HP` : state.runType === "endless" ? "SURVIVE THE WILD" : "PROTECT THE HEART";
  }

  function draw() {
    ctx.save();
    const shakeX = state.settings.reducedMotion ? 0 : rand(-state.shake, state.shake); const shakeY = state.settings.reducedMotion ? 0 : rand(-state.shake, state.shake); ctx.translate(shakeX, shakeY);
    drawBackground(); drawArena(); drawProjectiles(); drawBoss(); drawPlayer(); drawParticles();
    if (state.messageTime > 0 && state.mode === "playing") drawMessage();
    if (state.flash > 0) { ctx.fillStyle = `rgba(255, 100, 100, ${state.flash * .18})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    requestAnimationFrame(loop);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H); gradient.addColorStop(0, "#0c2b22"); gradient.addColorStop(.45, "#071a15"); gradient.addColorStop(1, "#050e0c"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(116, 245, 157, .035)"; for (let x = 0; x < W; x += 32) ctx.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 1);
    stars.forEach((star) => { ctx.globalAlpha = .2 + (Math.sin(star.phase) + 1) * .15; ctx.fillStyle = star.size > 1 ? "#74f59d" : "#b7ffd0"; ctx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size); }); ctx.globalAlpha = 1;
    ctx.fillStyle = "#0a241c"; for (let i = 0; i < 10; i++) { const x = i * 118 - 20; const h = 28 + (i % 3) * 12; ctx.fillRect(x, H - 64 - h, 8, h); ctx.fillRect(x - 8, H - 62 - h, 24, 7); ctx.fillRect(x + 7, H - 80 - h, 12, 6); }
  }

  function drawArena() {
    ctx.strokeStyle = "rgba(116, 245, 157, .18)"; ctx.lineWidth = 2; ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = "rgba(116, 245, 157, .07)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(28, 210); ctx.lineTo(W - 28, 210); ctx.stroke();
    ctx.fillStyle = "rgba(116, 245, 157, .6)"; [[28, 28], [W - 32, 28], [28, H - 32], [W - 32, H - 32]].forEach(([x, y]) => { ctx.fillRect(x, y, 4, 16); ctx.fillRect(x, y, 16, 4); });
    const pulse = (Math.sin(state.time * 2) + 1) * .5; ctx.fillStyle = `rgba(116, 245, 157, ${.04 + pulse * .05})`; ctx.fillRect(40, H - 83, W - 80, 1);
  }

  function drawProjectiles() {
    projectiles.forEach((bullet) => { const angle = Math.atan2(bullet.vy, bullet.vx); ctx.save(); ctx.translate(Math.round(bullet.x), Math.round(bullet.y)); ctx.rotate(angle); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(-bullet.radius - 2, -bullet.radius + 3, bullet.radius * 2 + 4, bullet.radius * 2); ctx.fillStyle = bullet.color; ctx.fillRect(-bullet.radius, -bullet.radius, bullet.radius * 2, bullet.radius * 2); ctx.fillStyle = "rgba(255,255,255,.42)"; ctx.fillRect(-bullet.radius + 1, -bullet.radius + 1, Math.max(1, bullet.radius / 2), Math.max(1, bullet.radius / 2)); ctx.restore(); });
  }

  function drawBoss() {
    const boss = state.boss; if (!boss) return; const flash = boss.flash > 0 ? "#ffffff" : (levels[state.level]?.color || "#ff8fa4");
    ctx.save(); ctx.translate(Math.round(boss.x), Math.round(boss.y));
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(-boss.radius - 12, boss.radius + 12, boss.radius * 2 + 24, 7);
    ctx.fillStyle = "rgba(116,245,157,.08)"; ctx.beginPath(); ctx.arc(0, 0, boss.radius + 12 + Math.sin(state.time * 4) * 4, 0, TAU); ctx.fill();
    ctx.fillStyle = flash; ctx.beginPath(); ctx.moveTo(-boss.radius, -10); ctx.lineTo(-boss.radius + 12, -boss.radius + 5); ctx.lineTo(-7, -boss.radius - 3); ctx.lineTo(0, -boss.radius + 10); ctx.lineTo(7, -boss.radius - 3); ctx.lineTo(boss.radius - 12, -boss.radius + 5); ctx.lineTo(boss.radius, -10); ctx.lineTo(boss.radius - 7, boss.radius - 2); ctx.lineTo(0, boss.radius + 8); ctx.lineTo(-boss.radius + 7, boss.radius - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#102c22"; ctx.fillRect(-boss.radius * .58, -boss.radius * .2, boss.radius * 1.16, boss.radius * .55); ctx.fillStyle = "#b7ffd0"; ctx.fillRect(-boss.radius * .42, -boss.radius * .1, 7, 7); ctx.fillRect(boss.radius * .24, -boss.radius * .1, 7, 7);
    ctx.restore();
    ctx.fillStyle = "rgba(5,17,14,.8)"; ctx.fillRect(W / 2 - 130, 52, 260, 8); ctx.fillStyle = levels[state.level]?.color || "#ff8fa4"; ctx.fillRect(W / 2 - 130, 52, 260 * clamp(boss.hp / boss.maxHp, 0, 1), 8); ctx.strokeStyle = "rgba(116,245,157,.45)"; ctx.strokeRect(W / 2 - 130, 52, 260, 8);
  }

  function drawPlayer() {
    player.trail.forEach((point, index) => { if (point.life <= 0) return; ctx.globalAlpha = point.life * .12; ctx.fillStyle = "#74f59d"; ctx.fillRect(point.x - 4, point.y - 4, 8, 8); }); ctx.globalAlpha = 1;
    const shieldWidth = player.brace ? .72 : .5; ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.aim); ctx.strokeStyle = player.brace ? "#b7ffd0" : "#74f59d"; ctx.lineWidth = player.brace ? 4 : 3; ctx.shadowColor = "#74f59d"; ctx.shadowBlur = player.brace ? 14 : 7; ctx.beginPath(); ctx.arc(0, 0, 29, -shieldWidth, shieldWidth); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = "rgba(116,245,157,.1)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 25, -shieldWidth, shieldWidth); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(Math.round(player.x), Math.round(player.y)); if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) ctx.globalAlpha = .35; ctx.fillStyle = "#143a2a"; ctx.fillRect(-13, -13, 26, 26); ctx.fillStyle = "#74f59d"; ctx.fillRect(-9, -12, 18, 24); ctx.fillRect(-12, -9, 24, 18); ctx.fillStyle = "#b7ffd0"; ctx.fillRect(-5, -8, 6, 6); ctx.fillStyle = "#1b6e4c"; ctx.fillRect(3, 3, 5, 5); ctx.restore();
    if (player.energy > 0) { ctx.fillStyle = "rgba(5,17,14,.8)"; ctx.fillRect(player.x - 22, player.y + 20, 44, 4); ctx.fillStyle = "#b7ffd0"; ctx.fillRect(player.x - 22, player.y + 20, 44 * player.energy / 100, 4); }
  }

  function drawParticles() { particles.forEach((particle) => { ctx.save(); ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.translate(Math.round(particle.x), Math.round(particle.y)); ctx.rotate(particle.rotation); ctx.fillStyle = particle.color; ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size); ctx.restore(); }); ctx.globalAlpha = 1; }
  function drawMessage() { const alpha = clamp(Math.min(state.messageTime * 3, 1), 0, 1); ctx.globalAlpha = alpha; ctx.fillStyle = "rgba(5,17,14,.86)"; ctx.fillRect(W / 2 - 180, H / 2 - 27, 360, 54); ctx.strokeStyle = "rgba(116,245,157,.45)"; ctx.strokeRect(W / 2 - 180, H / 2 - 27, 360, 54); ctx.fillStyle = "#b7ffd0"; ctx.font = "bold 15px Courier New"; ctx.textAlign = "center"; ctx.fillText(state.message, W / 2, H / 2 + 5); ctx.globalAlpha = 1; }

  function loop(timestamp) { const dt = Math.min(.05, (timestamp - state.lastTime) / 1000 || 0); state.lastTime = timestamp; update(dt); draw(); }
  function isTouchDevice() { return window.matchMedia("(pointer: coarse)").matches; }

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect(); const touch = event.touches?.[0] || event; pointer.x = (touch.clientX - rect.left) * W / rect.width; pointer.y = (touch.clientY - rect.top) * H / rect.height; pointer.active = true;
  }

  document.addEventListener("keydown", (event) => { const key = event.key.toLowerCase(); if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "escape"].includes(key)) event.preventDefault(); if (key === "escape" && state.mode === "playing") { state.mode = "paused"; showPanel("pause"); audio.stop(); return; } if (key === "escape" && state.mode === "paused") { resumeGame(); return; } keys.add(key); });
  document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  canvas.addEventListener("mousemove", setPointer); canvas.addEventListener("mousedown", (event) => { setPointer(event); pointer.down = true; audio.start(); }); canvas.addEventListener("mouseup", () => { pointer.down = false; }); canvas.addEventListener("mouseleave", () => { pointer.active = false; pointer.down = false; });
  canvas.addEventListener("touchstart", (event) => { event.preventDefault(); setPointer(event); pointer.down = true; audio.start(); }, { passive: false }); canvas.addEventListener("touchmove", (event) => { event.preventDefault(); setPointer(event); }, { passive: false }); canvas.addEventListener("touchend", (event) => { event.preventDefault(); pointer.down = false; pointer.active = false; }, { passive: false });

  function resumeGame() { if (state.mode !== "paused") return; state.mode = "playing"; showPanel(null); audio.start(); canvas.focus(); }
  document.addEventListener("click", (event) => { const action = event.target.closest("[data-action]")?.dataset.action; if (!action) return; if (action === "campaign") { buildLevelCards(); showPanel("level"); } else if (action === "endless") startEndless(); else if (action === "tutorial") showPanel("tutorial"); else if (action === "settings") { updateSettingsUI(); showPanel("settings"); } else if (action === "menu") { state.mode = "menu"; showPanel("menu"); audio.stop(); } else if (action === "resume") resumeGame(); else if (action === "quit") quitRun(); else if (action === "restart") restartRun(); });
  $("soundToggle").addEventListener("change", (event) => { state.settings.sound = event.target.checked; saveSettings(); if (state.settings.sound && state.mode === "playing") audio.start(); else if (!state.settings.sound) audio.stop(); });
  $("motionToggle").addEventListener("change", (event) => { state.settings.reducedMotion = event.target.checked; saveSettings(); });
  $("contrastToggle").addEventListener("change", (event) => { state.settings.highContrast = event.target.checked; saveSettings(); });

  audio = new Soundscape();
  updateSettingsUI(); buildLevelCards(); updateHud(); requestAnimationFrame(loop);
})();
