const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const playerBullets = [];
const enemyBullets = [];
const enemies = [];
const powerups = [];
const chainArcs = [];
const explosions = [];

const state = {
  running: true,
  score: 0,
  lives: 8,
  maxLives: 8,
  time: 0,
  kills: 0,
  level: 1,
  shootCooldown: 0,
  spawnTimer: 0,
  hitCooldown: 0,
  bossLevel: 0,
  boss: null,
  nextBossAt: 18,
  keys: new Set(),
  effects: {
    shield: 0,
    wingman: 0,
    reflect: 0,
    laser: 0,
    beam: 0,
    flame: 0,
    missile: 0,
    explosive: 0,
    homing: 0,
    giant: 0,
    ricochet: 0,
    chain: 0,
    rapid: 0,
  },
  beamActive: false,
  beamWidth: 12,
  beamPulse: 0,
  shieldBlockCooldown: 0,
  reflectCooldown: 0,
};

const player = {
  x: canvas.width / 2 - 22,
  y: canvas.height - 92,
  w: 44,
  h: 44,
  speed: 210,
};

const POWERUP_POOL = [
  "shield",
  "wingman",
  "laser",
  "missile",
  "shield",
  "laser",
  "missile",
];

const BOSS_REWARD_POOL = [
  "shield",
  "missile",
  "laser",
  "wingman",
];

const SPRITES = {
  player: [
    ".....C.....",
    "....CCC....",
    "...CCCCC...",
    "..CCAAACC..",
    ".CCAAAAACC.",
    "CCAAAAAAACC",
    "CCACCCCAACC",
    "CCCCBCCCCCC",
    "..CCB.BCC..",
    "..C.....C..",
    "...........",
  ],
  enemy: [
    ".....D.....",
    "....DDD....",
    "...DFFFD...",
    "..DDFFFD D..".replace(/ /g, ""),
    ".DFFFFFFFD.",
    "DFFFGGGFFFD",
    "DDDFFFFFDDD",
    "..DD...DD..",
    "...D...D...",
    "...........",
  ],
  boss: [
    ".......EEE.......",
    "......EEEEE......",
    "....EEEEAEEEE....",
    "...EEAAAAAAAAEE...",
    "..EEAAABBBBAAAEE..",
    ".EEAABBBBBBBBAAEE.",
    "EEAABBBCCCB BBAAEE".replace(/ /g, ""),
    "EEAABBBCCCB BBAAEE".replace(/ /g, ""),
    "EEAABBBBBBBBAAEE",
    ".EEAADDDDDDDAAEE.",
    "..EEDDD..DDDDEE..",
    "...EDD....DDE...",
    "...DD......DD...",
    ".................",
  ],
};

const COLORS = {
  A: "#6ad0ff",
  B: "#b3f3ff",
  C: "#2d5e9e",
  D: "#e05b87",
  E: "#bb7dff",
  F: "#ff9ab5",
  G: "#42264f",
};

const BALANCE = {
  baseDropChance: 0.085,
  maxDropChance: 0.14,
  weaponKillStep: 12,
  earlyGameSeconds: 45,
  startSpawnDelay: 1.15,
};

function reset() {
  state.running = true;
  state.score = 0;
  state.lives = state.maxLives;
  state.time = 0;
  state.kills = 0;
  state.level = 1;
  state.shootCooldown = 0;
  state.spawnTimer = BALANCE.startSpawnDelay;
  state.hitCooldown = 0;
  state.bossLevel = 0;
  state.boss = null;
  state.nextBossAt = 18;
  state.beamActive = false;
  state.beamWidth = 12;
  state.beamPulse = 0;
  state.shieldBlockCooldown = 0;
  state.reflectCooldown = 0;

  for (const key of Object.keys(state.effects)) state.effects[key] = 0;

  player.x = canvas.width / 2 - player.w / 2;
  player.y = canvas.height - player.h - 20;

  playerBullets.length = 0;
  enemyBullets.length = 0;
  enemies.length = 0;
  powerups.length = 0;
  chainArcs.length = 0;
  explosions.length = 0;
}

function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getPlayerPowerLevel() {
  const equipSum = state.effects.shield + state.effects.missile + state.effects.laser + state.effects.wingman;
  return 1 + state.level * 0.95 + equipSum * 0.9;
}

function getTargetPowerLevel() {
  // Expected combat power curve by survival time and boss progression.
  return 2 + state.time * 0.048 + state.bossLevel * 0.9 + state.kills * 0.012;
}

function getPowerGapFactor() {
  // >0 means player is over target (game should tighten), <0 means under target.
  const gap = getPlayerPowerLevel() - getTargetPowerLevel();
  return clamp(gap / 8, -0.8, 0.9);
}

function calcEnemyHpByScaleAndShade(size, shadeTier) {
  const sizeScore = (size - 26) / 6;
  const shadeScore = shadeTier * 0.9;
  const t = state.time;
  const playerPower = getPlayerPowerLevel();
  const gapFactor = getPowerGapFactor();
  const earlyEase = t < BALANCE.earlyGameSeconds ? (BALANCE.earlyGameSeconds - t) / BALANCE.earlyGameSeconds : 0;
  const playerScale = playerPower * (0.18 + Math.min(0.22, t * 0.0025));
  const timeScale = t * 0.013;
  const anchorScale = gapFactor * 1.15;
  const easedBase = 1.4 - earlyEase * 0.8;
  return Math.max(1, Math.round(easedBase + sizeScore + shadeScore + playerScale + timeScale + anchorScale));
}

function getPowerupDropChance(mult = 1) {
  const tBonus = Math.min(0.025, state.time * 0.0003);
  const powerPenalty = Math.min(0.045, getPlayerPowerLevel() * 0.0024);
  const gapFactor = getPowerGapFactor();
  const anchorAdjust = -gapFactor * 0.03;
  const raw = BALANCE.baseDropChance + tBonus - powerPenalty + anchorAdjust;
  return Math.min(BALANCE.maxDropChance, Math.max(0.045, raw) * mult);
}

function maybeDropPowerup(x, y, mult = 1) {
  if (Math.random() < getPowerupDropChance(mult)) {
    spawnPowerup(x, y);
  }
}

function rollPowerupTier(minTier = 1) {
  const t = state.time;
  let tier = minTier;
  const r = Math.random();
  if (r < Math.min(0.22, 0.08 + t * 0.0014)) tier = Math.max(tier, 2);
  if (r < Math.min(0.09, 0.02 + t * 0.0007)) tier = Math.max(tier, 3);
  if (r < Math.min(0.03, 0.005 + t * 0.00025)) tier = Math.max(tier, 4);
  return tier;
}

function equipGear(type, tier) {
  const oldTier = state.effects[type] || 0;
  state.effects[type] = tier;
  state.score += tier > oldTier ? 16 : 8;
}

function tryUpgradeEffect(key, maxLevel) {
  const current = state.effects[key];
  if (current >= maxLevel) {
    state.score += 6;
    return;
  }
  const gapFactor = getPowerGapFactor();
  const successChance = clamp(1 - current * 0.1 - gapFactor * 0.18, 0.38, 0.95);
  if (Math.random() < successChance) {
    state.effects[key] = current + 1;
  } else {
    state.score += 4;
  }
}

function getEnemySpeedScale() {
  // Gentle start, then ramp up after the first minute.
  const t = state.time;
  const gapFactor = getPowerGapFactor();
  const anchor = 1 + gapFactor * 0.25;
  if (t < 45) return (0.58 + t * 0.0046) * anchor;
  return (0.79 + (t - 45) * 0.0066) * anchor;
}

function getSpawnInterval() {
  // Slower opening to avoid overwhelm, faster mid/late game to keep pressure.
  const t = state.time;
  const gapFactor = getPowerGapFactor();
  const anchor = 1 - gapFactor * 0.26;
  let base = 0.5;
  if (t < 40) base = 1.08 - t * 0.011;
  else if (t < 110) base = 0.64 - (t - 40) * 0.003;
  else base = 0.38 - (t - 110) * 0.0009;
  return clamp(base * anchor, 0.24, 1.0);
}

function getEnemyCap() {
  const t = state.time;
  if (t < 20) return 2;
  if (t < 45) return 3;
  if (t < 80) return 4;
  if (t < 130) return 5;
  return 6;
}

function spawnEnemy() {
  const motionRoll = Math.random();
  let motion = "sine";
  if (motionRoll > 0.34) motion = "zigzag";
  if (motionRoll > 0.67) motion = "dive";

  const level = Math.floor(state.time / 24) + 1;
  const speedScale = getEnemySpeedScale();
  const size = 26 + Math.random() * 18;
  const w = Math.round(size);
  const h = Math.round(size * 0.9);
  const shadeTier = Math.floor(Math.random() * 3);
  const hp = calcEnemyHpByScaleAndShade(size, shadeTier);
  enemies.push({
    x: Math.random() * (canvas.width - w),
    y: -h - Math.random() * 70,
    w,
    h,
    hp,
    maxHp: hp,
    speed: (70 + Math.random() * 45 + level * 6) * speedScale,
    fireCooldown: 1 + Math.random() * 1.6,
    age: 0,
    motion,
    phase: Math.random() * Math.PI * 2,
    vx: Math.random() < 0.5 ? -95 : 95,
    shadeTier,
  });
}

function spawnBoss() {
  state.bossLevel += 1;
  const w = 102;
  const h = 84;
  const gapFactor = getPowerGapFactor();
  const anchorHp = 1 + gapFactor * 0.22;
  const maxHp = Math.round((200 + state.bossLevel * 125 + getPlayerPowerLevel() * 30 + state.time * 0.42) * anchorHp);
  const modes = ["shield", "laser"];
  if (state.bossLevel >= 2) modes.push("missile");
  if (state.bossLevel >= 3) modes.push("homing");

  state.boss = {
    x: canvas.width / 2 - w / 2,
    y: -h - 10,
    w,
    h,
    hp: maxHp,
    maxHp,
    age: 0,
    shootCooldown: 1.1,
    dashCooldown: 3.2,
    targetX: canvas.width / 2 - w / 2,
    driftPhase: Math.random() * Math.PI * 2,
    modeIndex: 0,
    modeTimer: 5,
    modes,
  };
}

function spawnPowerup(x, y) {
  const type = POWERUP_POOL[Math.floor(Math.random() * POWERUP_POOL.length)];
  powerups.push({ x, y, w: 18, h: 18, vy: 90, type, tier: rollPowerupTier(1) });
}

function spawnBossReward(x, y) {
  const type = BOSS_REWARD_POOL[Math.floor(Math.random() * BOSS_REWARD_POOL.length)];
  powerups.push({
    x: x - 11,
    y: y - 11,
    w: 22,
    h: 22,
    vy: 86,
    type,
    tier: rollPowerupTier(3),
    bossReward: true,
  });
}

function defeatBoss(dropX, dropY, scoreBonus = 0) {
  if (!state.boss) return;
  state.score += 520 + state.bossLevel * 160 + scoreBonus;
  spawnBossReward(dropX, dropY);
  state.boss = null;
  state.nextBossAt += 18 + state.bossLevel * 8;
}

function addPlayerBullet(data) {
  playerBullets.push({
    x: data.x,
    y: data.y,
    w: data.w,
    h: data.h,
    vx: data.vx,
    vy: data.vy,
    damage: data.damage,
    type: data.type,
    pierce: data.pierce || 0,
    bounces: data.bounces || 0,
    explosive: !!data.explosive,
    ttl: data.ttl || 3,
  });
}

function addExplosion(x, y, radius, damage) {
  explosions.push({ x, y, radius, ttl: 0.26 });

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    if (Math.hypot(ex - x, ey - y) <= radius) {
      e.hp -= damage;
      if (e.hp <= 0) {
        enemies.splice(i, 1);
        state.kills += 1;
        state.score += 15;
        maybeDropPowerup(e.x + 7, e.y + 6, 0.75);
      }
    }
  }

  if (state.boss) {
    const bx = state.boss.x + state.boss.w / 2;
    const by = state.boss.y + state.boss.h / 2;
    if (Math.hypot(bx - x, by - y) <= radius + 32) {
      state.boss.hp -= damage * 2;
      if (state.boss.hp <= 0) {
        defeatBoss(bx, by);
      }
    }
  }
}

function fireWingman(cx) {
  if (state.effects.wingman <= 0) return;
  const level = state.effects.wingman;
  const sync = getPlayerPowerLevel();
  addPlayerBullet({ x: player.x - 5, y: player.y + 4, w: 5, h: 10, vx: -20, vy: -430, damage: 0.8 + sync * 0.14 + level * 0.25, type: "wing" });
  addPlayerBullet({ x: player.x + player.w, y: player.y + 4, w: 5, h: 10, vx: 20, vy: -430, damage: 0.8 + sync * 0.14 + level * 0.25, type: "wing" });

  if (level >= 2) {
    addPlayerBullet({ x: cx - 3, y: player.y + 2, w: 6, h: 12, vx: 0, vy: -440, damage: 2, type: "wing" });
  }
  if (level >= 3) {
    addPlayerBullet({ x: player.x - 8, y: player.y + 10, w: 5, h: 11, vx: -90, vy: -360, damage: 1, type: "wing" });
    addPlayerBullet({ x: player.x + player.w + 3, y: player.y + 10, w: 5, h: 11, vx: 90, vy: -360, damage: 1, type: "wing" });
  }
  if (level >= 4 && state.effects.missile > 0) {
    addPlayerBullet({ x: player.x - 4, y: player.y - 2, w: 6, h: 12, vx: -25, vy: -300, damage: 1.6 + state.effects.missile * 0.5, type: "missile", ttl: 4, explosive: true });
    addPlayerBullet({ x: player.x + player.w - 2, y: player.y - 2, w: 6, h: 12, vx: 25, vy: -300, damage: 1.6 + state.effects.missile * 0.5, type: "missile", ttl: 4, explosive: true });
  }
}

function firePlayer() {
  const cx = player.x + player.w / 2;
  const sync = getPlayerPowerLevel();
  const baseDamage = 1 + sync * 0.22;
  const sizeMul = 1 + Math.min(0.45, sync * 0.035);
  const ricochetCount = 0;

  if (state.effects.laser > 0) {
    const laserLevel = state.effects.laser;
    addPlayerBullet({
      x: cx - 4 * sizeMul,
      y: player.y - 24,
      w: 8 * sizeMul,
      h: 30 + laserLevel * 3,
      vx: 0,
      vy: -760,
      damage: baseDamage + laserLevel * 0.75,
      type: "laser",
      pierce: 8 + laserLevel * 2,
      ttl: 0.6,
      bounces: ricochetCount,
    });
  }

  if (state.effects.missile > 0) {
    const missileLevel = state.effects.missile;
    addPlayerBullet({ x: cx - 4, y: player.y - 10, w: 8, h: 14, vx: 0, vy: -300, damage: baseDamage * 0.9 + missileLevel * 0.8, type: "missile", ttl: 4, explosive: true, bounces: ricochetCount });
    if (missileLevel >= 3) {
      addPlayerBullet({ x: cx - 18, y: player.y - 4, w: 7, h: 12, vx: -35, vy: -290, damage: baseDamage * 0.55 + missileLevel * 0.55, type: "missile", ttl: 4, explosive: true, bounces: ricochetCount });
      addPlayerBullet({ x: cx + 11, y: player.y - 4, w: 7, h: 12, vx: 35, vy: -290, damage: baseDamage * 0.55 + missileLevel * 0.55, type: "missile", ttl: 4, explosive: true, bounces: ricochetCount });
    }
  }

  const spread = state.level >= 4 ? 3 : state.level >= 2 ? 2 : 1;
  for (let i = 0; i < spread; i++) {
    const t = spread === 1 ? 0 : (i / (spread - 1) - 0.5);
    addPlayerBullet({
      x: cx - (3 * sizeMul) + t * 18,
      y: player.y - 8,
      w: 6 * sizeMul,
      h: 12 * sizeMul,
      vx: t * 140,
      vy: -450,
      damage: baseDamage,
      type: "normal",
      ttl: 3,
      bounces: ricochetCount,
    });
  }

  fireWingman(cx);
}

function fireEnemyBullet(sourceX, sourceY, speed, kind = "normal") {
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  const dx = px - sourceX;
  const dy = py - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  let vx = (dx / len) * speed;
  let vy = (dy / len) * speed;

  if (kind === "spray") {
    vx += (Math.random() - 0.5) * 120;
    vy += Math.random() * 50;
  }

  enemyBullets.push({ x: sourceX - 2, y: sourceY, w: 6, h: 10, vx, vy, ttl: 5, type: kind, damage: 1 });
}

function fireBoss() {
  const b = state.boss;
  if (!b) return;

  const cx = b.x + b.w / 2;
  const y = b.y + b.h - 8;

  const spread = 4 + Math.min(3, state.bossLevel);
  for (let i = 0; i < spread; i++) {
    const t = i / (spread - 1) - 0.5;
    enemyBullets.push({ x: cx - 3 + t * 20, y, w: 6, h: 10, vx: t * 220, vy: 180 + Math.abs(t) * 40, ttl: 5, type: "boss", damage: 1 });
  }

  const mode = b.modes[b.modeIndex];
  if (mode === "laser") {
    enemyBullets.push({ x: cx - 6, y: y + 2, w: 12, h: 46, vx: 0, vy: 260, ttl: 1.4, type: "bossLaser", damage: 2, pierce: 99 });
  }
  if (mode === "missile") {
    enemyBullets.push({ x: cx - 4, y, w: 8, h: 12, vx: 0, vy: 160, ttl: 7, type: "bossMissile", damage: 2, homing: 2.8 });
  }
  if (mode === "homing") {
    fireEnemyBullet(cx - 14, y, 220, "homing");
    fireEnemyBullet(cx + 14, y, 220, "homing");
  }
}

function updateBeamDamage(dt) {
  state.beamActive = false;
  if (state.effects.laser <= 0) return;
  const shooting = state.keys.has(" ") || state.keys.has("Spacebar");
  if (!shooting) return;

  state.beamActive = true;
  state.beamPulse += dt * 16;
  const beamLevel = state.effects.laser;
  state.beamWidth = 8 + Math.sin(state.beamPulse) * 2 + Math.min(10, beamLevel * 1.8);

  const beamX = player.x + player.w / 2 - state.beamWidth / 2;
  const beamRect = { x: beamX, y: 0, w: state.beamWidth, h: player.y };
  const tickDamage = (8 + beamLevel * 2.2) * dt;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!rectHit(beamRect, e)) continue;
    e.hp -= tickDamage;
    if (e.hp <= 0) {
      enemies.splice(i, 1);
      state.kills += 1;
      state.score += 14;
      maybeDropPowerup(e.x + 7, e.y + 7, 0.7);
    }
  }

  if (state.boss && rectHit(beamRect, state.boss)) {
    state.boss.hp -= tickDamage * 0.9;
    if (state.boss.hp <= 0) {
      const bx = state.boss.x + state.boss.w / 2;
      const by = state.boss.y + state.boss.h / 2;
      defeatBoss(bx, by);
    }
  }
}

function updatePlayer(dt) {
  const left = state.keys.has("ArrowLeft") || state.keys.has("a");
  const right = state.keys.has("ArrowRight") || state.keys.has("d");
  const up = state.keys.has("ArrowUp") || state.keys.has("w");
  const down = state.keys.has("ArrowDown") || state.keys.has("s");

  if (left) player.x -= player.speed * dt;
  if (right) player.x += player.speed * dt;
  if (up) player.y -= player.speed * dt;
  if (down) player.y += player.speed * dt;

  player.x = clamp(player.x, 0, canvas.width - player.w);
  player.y = clamp(player.y, canvas.height * 0.22, canvas.height - player.h);

  const shoot = state.keys.has(" ") || state.keys.has("Spacebar");
  if (shoot && state.shootCooldown <= 0) {
    firePlayer();
    let cd = 0.24 - (state.level - 1) * 0.016 - state.effects.wingman * 0.007;
    if (state.effects.laser > 0) cd += 0.015;
    state.shootCooldown = clamp(cd, 0.06, 0.25);
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.age += dt;

    if (e.motion === "sine") {
      e.x += Math.sin(e.age * 2.1 + e.phase) * 55 * dt;
      e.y += e.speed * dt;
    } else if (e.motion === "zigzag") {
      e.x += e.vx * dt;
      e.y += (e.speed + 30) * dt;
      if (e.x < 0 || e.x + e.w > canvas.width) e.vx *= -1;
    } else {
      e.y += (e.speed + 10) * dt;
      if (e.y > 90) {
        const tx = player.x + player.w / 2 - e.w / 2;
        e.x += (tx - e.x) * Math.min(1, dt * 1.35);
      }
      e.x += Math.sin(e.age * 6 + e.phase) * 18 * dt;
    }

    e.fireCooldown -= dt;
    if (e.fireCooldown <= 0 && e.y > 24) {
      fireEnemyBullet(e.x + e.w / 2, e.y + e.h, 180 + Math.random() * 70, "spray");
      e.fireCooldown = 1 + Math.random() * 1.6;
    }

    if (e.y > canvas.height + 80 || e.x < -60 || e.x > canvas.width + 60) {
      enemies.splice(i, 1);
    }
  }
}

function updateBoss(dt) {
  const b = state.boss;
  if (!b) return;

  b.age += dt;
  if (b.y < 36) {
    b.y += 65 * dt;
    return;
  }

  // Base hover keeps the boss alive-looking without large jumps.
  b.x += Math.sin(b.age * 1.7 + b.driftPhase) * 24 * dt;
  b.dashCooldown -= dt;
  if (b.dashCooldown <= 0) {
    const px = player.x + player.w / 2 - b.w / 2;
    const jitter = (Math.random() - 0.5) * 70;
    b.targetX = clamp(px + jitter, 8, canvas.width - b.w - 8);
    b.dashCooldown = Math.max(1.2, 3 - state.bossLevel * 0.2);
  }

  // Smooth chase towards targetX to remove teleport-like snapping.
  const dx = b.targetX - b.x;
  const maxStep = (110 + state.bossLevel * 18) * dt;
  b.x += clamp(dx, -maxStep, maxStep);

  b.x = clamp(b.x, 8, canvas.width - b.w - 8);

  b.modeTimer -= dt;
  if (b.modeTimer <= 0) {
    b.modeIndex = (b.modeIndex + 1) % b.modes.length;
    b.modeTimer = 4.5;
  }

  b.shootCooldown -= dt;
  if (b.shootCooldown <= 0) {
    fireBoss();
    b.shootCooldown = Math.max(0.45, 1 - state.bossLevel * 0.08);
  }
}

function nearestEnemyOrBoss(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const d = (ex - x) ** 2 + (ey - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  if (state.boss) {
    const bx = state.boss.x + state.boss.w / 2;
    const by = state.boss.y + state.boss.h / 2;
    const d = (bx - x) ** 2 + (by - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = state.boss;
    }
  }
  return best;
}

function updatePlayerBullets(dt) {
  for (let i = playerBullets.length - 1; i >= 0; i--) {
    const b = playerBullets[i];
    b.ttl -= dt;

    if (b.type === "homing" || (b.type === "missile" && state.effects.homing > 0)) {
      const target = nearestEnemyOrBoss(b.x, b.y);
      if (target) {
        const tx = target.x + target.w / 2;
        const ty = target.y + target.h / 2;
        const dx = tx - b.x;
        const dy = ty - b.y;
        const len = Math.hypot(dx, dy) || 1;
        const desiredVx = (dx / len) * 300;
        const desiredVy = (dy / len) * 300;
        b.vx += (desiredVx - b.vx) * Math.min(1, 4 * dt);
        b.vy += (desiredVy - b.vy) * Math.min(1, 4 * dt);
      }
    }

    if (b.type === "flame") {
      b.vx *= 0.96;
      b.vy *= 0.94;
      b.damage = Math.max(0.2, b.damage - dt * 0.9);
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.bounces > 0) {
      if (b.x <= 0 || b.x + b.w >= canvas.width) {
        b.vx *= -1;
        b.bounces -= 1;
        b.x = clamp(b.x, 0, canvas.width - b.w);
      }
      if (b.y <= 0) {
        b.vy = Math.abs(b.vy);
        b.bounces -= 1;
        b.y = 0;
      }
    }

    if (b.ttl <= 0 || b.y < -80 || b.y > canvas.height + 80 || b.x < -80 || b.x > canvas.width + 80) {
      playerBullets.splice(i, 1);
    }
  }
}

function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.ttl -= dt;

    if (b.homing) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      const dx = px - b.x;
      const dy = py - b.y;
      const len = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / len) * 230;
      const desiredVy = (dy / len) * 230;
      b.vx += (desiredVx - b.vx) * Math.min(1, b.homing * dt);
      b.vy += (desiredVy - b.vy) * Math.min(1, b.homing * dt);
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.ttl <= 0 || b.y < -90 || b.y > canvas.height + 90 || b.x < -90 || b.x > canvas.width + 90) {
      enemyBullets.splice(i, 1);
    }
  }
}

function damagePlayer(amount) {
  if (state.hitCooldown > 0) return;
  if (state.effects.shield > 0) {
    if (state.shieldBlockCooldown <= 0) {
      state.shieldBlockCooldown = Math.max(0.18, 0.7 - state.effects.shield * 0.06);
      state.hitCooldown = 0.16;
      return;
    }
    amount = Math.max(1, amount - Math.floor(state.effects.shield / 3));
  }

  state.lives -= amount;
  state.hitCooldown = 0.5;
  if (state.lives <= 0) {
    state.lives = 0;
    state.running = false;
  }
}

function chainDamage(startTarget) {
  if (state.effects.chain <= 0) return;
  const visited = new Set([startTarget]);
  let source = startTarget;

  for (let jump = 0; jump < 3; jump++) {
    let best = null;
    let bestDist = Infinity;

    for (const e of enemies) {
      if (visited.has(e)) continue;
      const dx = (e.x + e.w / 2) - (source.x + source.w / 2);
      const dy = (e.y + e.h / 2) - (source.y + source.h / 2);
      const d = Math.hypot(dx, dy);
      if (d < 120 && d < bestDist) {
        bestDist = d;
        best = e;
      }
    }

    if (!best && state.boss && !visited.has(state.boss)) {
      const dx = (state.boss.x + state.boss.w / 2) - (source.x + source.w / 2);
      const dy = (state.boss.y + state.boss.h / 2) - (source.y + source.h / 2);
      const d = Math.hypot(dx, dy);
      if (d < 140) best = state.boss;
    }

    if (!best) break;

    const ax = source.x + source.w / 2;
    const ay = source.y + source.h / 2;
    const bx = best.x + best.w / 2;
    const by = best.y + best.h / 2;
    chainArcs.push({ x1: ax, y1: ay, x2: bx, y2: by, ttl: 0.12 });

    if (best === state.boss) {
      state.boss.hp -= 5;
      if (state.boss.hp <= 0) {
        const bx = state.boss.x + state.boss.w / 2;
        const by = state.boss.y + state.boss.h / 2;
        defeatBoss(bx, by, -100);
      }
      break;
    }

    best.hp -= 2;
    if (best.hp <= 0) {
      const idx = enemies.indexOf(best);
      if (idx >= 0) {
        enemies.splice(idx, 1);
        state.kills += 1;
        state.score += 18;
        maybeDropPowerup(best.x + 7, best.y + 7, 0.72);
      }
    }

    visited.add(best);
    source = best;
  }
}

function handleHits() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (rectHit(player, e)) {
      enemies.splice(i, 1);
      damagePlayer(1);
      continue;
    }

    for (let j = playerBullets.length - 1; j >= 0; j--) {
      const b = playerBullets[j];
      if (!rectHit(b, e)) continue;

      e.hp -= b.damage;
      if (b.pierce > 0) b.pierce -= 1;
      else {
        if (b.explosive) {
          addExplosion(b.x + b.w / 2, b.y + b.h / 2, 58, 3);
        }
        playerBullets.splice(j, 1);
      }

      if (state.effects.chain > 0) chainDamage(e);

      if (e.hp <= 0) {
        enemies.splice(i, 1);
        state.kills += 1;
        state.score += 15;
        maybeDropPowerup(e.x + 7, e.y + 6, 1);
        if (state.kills % BALANCE.weaponKillStep === 0) state.level = Math.min(4, state.level + 1);
      }
      break;
    }
  }

  const b = state.boss;
  if (b) {
    if (rectHit(player, b)) damagePlayer(2);

    for (let i = playerBullets.length - 1; i >= 0; i--) {
      const bullet = playerBullets[i];
      if (!rectHit(bullet, b)) continue;

      b.hp -= bullet.damage;
      if (bullet.pierce > 0) bullet.pierce -= 1;
      else {
        if (bullet.explosive) {
          addExplosion(bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, 64, 3);
        }
        playerBullets.splice(i, 1);
      }

      if (state.effects.chain > 0) chainDamage(b);
      if (b.hp <= 0) {
        const bx = b.x + b.w / 2;
        const by = b.y + b.h / 2;
        defeatBoss(bx, by);
        break;
      }
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];
    if (rectHit(player, bullet)) {
      if (state.effects.reflect > 0 && state.reflectCooldown <= 0) {
        const reflectVx = bullet.vx * 0.6 + (Math.random() - 0.5) * 90;
        const reflectVy = -Math.abs(bullet.vy) - 80;
        addPlayerBullet({
          x: bullet.x,
          y: bullet.y,
          w: Math.max(4, bullet.w - 1),
          h: Math.max(6, bullet.h - 1),
          vx: reflectVx,
          vy: reflectVy,
          damage: Math.max(1, bullet.damage || 1),
          type: "reflected",
          ttl: 2.4,
          bounces: state.effects.ricochet > 0 ? 1 : 0,
        });
        state.reflectCooldown = Math.max(0.1, 0.52 - state.effects.reflect * 0.05);
        enemyBullets.splice(i, 1);
      } else {
        enemyBullets.splice(i, 1);
        damagePlayer(bullet.damage || 1);
      }
    }
  }

  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    if (!rectHit(player, p)) continue;

    if (p.type === "shield" || p.type === "missile" || p.type === "laser" || p.type === "wingman") {
      equipGear(p.type, p.tier || 1);
      state.lives = Math.min(state.maxLives, state.lives + (p.bossReward ? 1 : 0));
    }

    powerups.splice(i, 1);
  }
}

function updatePowerups(dt) {
  for (const p of powerups) p.y += p.vy * dt;
  for (let i = powerups.length - 1; i >= 0; i--) {
    if (powerups[i].y > canvas.height + 30) powerups.splice(i, 1);
  }

  for (let i = chainArcs.length - 1; i >= 0; i--) {
    chainArcs[i].ttl -= dt;
    if (chainArcs[i].ttl <= 0) chainArcs.splice(i, 1);
  }

  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].ttl -= dt;
    if (explosions[i].ttl <= 0) explosions.splice(i, 1);
  }
}

function maybeSpawnBoss() {
  if (state.boss) return;
  if (state.kills >= state.nextBossAt) {
    enemies.length = 0;
    spawnBoss();
  }
}

function update(dt) {
  if (!state.running) return;

  state.time += dt;
  state.spawnTimer -= dt;
  state.shootCooldown -= dt;
  state.hitCooldown = Math.max(0, state.hitCooldown - dt);
  state.shieldBlockCooldown = Math.max(0, state.shieldBlockCooldown - dt);
  state.reflectCooldown = Math.max(0, state.reflectCooldown - dt);

  updatePlayer(dt);

  maybeSpawnBoss();
  if (!state.boss && state.spawnTimer <= 0 && enemies.length < getEnemyCap()) {
    spawnEnemy();
    state.spawnTimer = getSpawnInterval();
  }

  updateEnemies(dt);
  updateBoss(dt);
  updatePlayerBullets(dt);
  updateEnemyBullets(dt);
  updateBeamDamage(dt);
  updatePowerups(dt);
  handleHits();
}

function drawSprite(sprite, x, y, scale, palette) {
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale);
    }
  }
}

function drawBackground() {
  ctx.fillStyle = "#0a1020";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const t = state.time;
  for (let i = 0; i < 80; i++) {
    const x = (i * 47) % canvas.width;
    const y = (i * 61 + t * (25 + (i % 5) * 10)) % canvas.height;
    ctx.fillStyle = i % 5 === 0 ? "#4ad6ff" : "#365b8a";
    ctx.fillRect((x | 0), (y | 0), 2, 2);
  }
}

function drawPlayer() {
  if (state.effects.shield > 0) {
    ctx.strokeStyle = "#63ffe4";
    ctx.lineWidth = 2;
    ctx.strokeRect(player.x - 4, player.y - 4, player.w + 8, player.h + 8);
  }
  if (state.effects.reflect > 0) {
    ctx.strokeStyle = "#ffd37a";
    ctx.lineWidth = 2;
    ctx.strokeRect(player.x - 7, player.y - 7, player.w + 14, player.h + 14);
  }

  if (state.hitCooldown > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(player.x - 2, player.y - 2, player.w + 4, player.h + 4);
  }

  drawSprite(SPRITES.player, player.x, player.y, 4, COLORS);

  if (state.effects.wingman > 0) {
    const wingLevel = state.effects.wingman;
    ctx.fillStyle = "#87ffc8";
    ctx.fillRect(player.x - 10, player.y + 14, 6, 12);
    ctx.fillRect(player.x + player.w + 4, player.y + 14, 6, 12);
    if (wingLevel >= 2) {
      ctx.fillRect(player.x - 14, player.y + 10, 4, 10);
      ctx.fillRect(player.x + player.w + 10, player.y + 10, 4, 10);
    }
    if (wingLevel >= 3) {
      ctx.fillRect(player.x - 14, player.y + 26, 4, 8);
      ctx.fillRect(player.x + player.w + 10, player.y + 26, 4, 8);
    }
  }
}

function drawEnemy(e) {
  const enemyPalette = {
    ...COLORS,
    D: e.shadeTier === 0 ? "#f27aa8" : e.shadeTier === 1 ? "#d65f94" : "#b54a7b",
    F: e.shadeTier === 0 ? "#ffc2d5" : e.shadeTier === 1 ? "#f09ab7" : "#d17697",
    G: e.shadeTier === 0 ? "#54365f" : e.shadeTier === 1 ? "#472a55" : "#3a204a",
  };
  const scale = Math.max(2, Math.round(e.w / 11));
  drawSprite(SPRITES.enemy, e.x, e.y, scale, enemyPalette);
}

function drawBoss() {
  if (!state.boss) return;
  const b = state.boss;
  drawSprite(SPRITES.boss, b.x, b.y, 6, COLORS);

  const mode = b.modes[b.modeIndex];
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.fillText(`BOSS-${state.bossLevel} ${mode.toUpperCase()}`, b.x + 4, b.y - 8);

  const barX = 54;
  const barY = 10;
  const barW = canvas.width - 108;
  const pct = clamp(b.hp / b.maxHp, 0, 1);
  ctx.fillStyle = "#33203f";
  ctx.fillRect(barX, barY, barW, 12);
  ctx.fillStyle = "#ff5fa8";
  ctx.fillRect(barX + 1, barY + 1, (barW - 2) * pct, 10);
  ctx.strokeStyle = "#ffd3ea";
  ctx.strokeRect(barX, barY, barW, 12);
}

function drawBullets() {
  if (state.beamActive) {
    const bw = state.beamWidth;
    const bx = player.x + player.w / 2 - bw / 2;
    const by = 0;
    const bh = player.y;
    ctx.fillStyle = "rgba(255,120,165,0.25)";
    ctx.fillRect(bx - 3, by, bw + 6, bh);
    ctx.fillStyle = "#ff87b0";
    ctx.fillRect(bx, by, bw, bh);
  }

  for (const b of playerBullets) {
    if (b.type === "laser") ctx.fillStyle = "#ff6d98";
    else if (b.type === "missile") ctx.fillStyle = "#ffc57d";
    else if (b.type === "flame") ctx.fillStyle = "#ff9a4d";
    else if (b.type === "reflected") ctx.fillStyle = "#ffe08a";
    else if (b.type === "homing") ctx.fillStyle = "#b6a3ff";
    else if (b.type === "wing") ctx.fillStyle = "#8bffd5";
    else ctx.fillStyle = "#ffe17c";
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }

  for (const b of enemyBullets) {
    if (b.type === "bossLaser") ctx.fillStyle = "#ff5b8a";
    else if (b.type === "bossMissile") ctx.fillStyle = "#ff9d6e";
    else if (b.type === "homing") ctx.fillStyle = "#ff8de3";
    else ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }

  for (const a of chainArcs) {
    ctx.strokeStyle = "#8ef6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo((a.x1 + a.x2) / 2 + (Math.random() - 0.5) * 10, (a.y1 + a.y2) / 2 + (Math.random() - 0.5) * 10);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();
  }

  for (const ex of explosions) {
    const alpha = clamp(ex.ttl / 0.26, 0, 1);
    ctx.fillStyle = `rgba(255, 157, 90, ${alpha * 0.55})`;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius * (1 - alpha * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPowerups() {
  const map = {
    shield: ["#7df5ff", "S"],
    wingman: ["#85ffc3", "G"],
    laser: ["#ff799f", "L"],
    missile: ["#ffb672", "M"],
  };

  for (const p of powerups) {
    const [color, icon] = map[p.type] || ["#ffffff", "?"];
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (p.bossReward) {
      ctx.strokeStyle = "#fff7a8";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
    }
    ctx.fillStyle = "#101826";
    ctx.font = "bold 11px 'Courier New', monospace";
    const offsetX = icon.length > 1 ? 2 : 6;
    ctx.fillText(icon, p.x + offsetX, p.y + 13);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.fillText(String(p.tier || 1), p.x + p.w - 7, p.y + 8);
  }
}

function drawLives() {
  for (let i = 0; i < state.maxLives; i++) {
    const x = canvas.width - 10 - i * 14;
    const y = 30;
    ctx.fillStyle = i < state.lives ? "#ff6f8b" : "#4d3245";
    ctx.fillRect(x - 8, y - 6, 3, 3);
    ctx.fillRect(x - 2, y - 6, 3, 3);
    ctx.fillRect(x - 8, y - 3, 9, 3);
    ctx.fillRect(x - 5, y, 3, 3);
  }
}

function drawHud() {
  ctx.fillStyle = "#d7ebff";
  ctx.font = "bold 13px 'Courier New', monospace";
  const syncPower = getPlayerPowerLevel().toFixed(1);
  ctx.fillText(`SCORE ${state.score}`, 10, 16);
  ctx.fillText(`KILL ${state.kills}`, 10, 32);
  ctx.fillText(`LV ${state.level}`, 10, 48);
  ctx.fillText(`SYNC ${syncPower}  NEXT BOSS ${Math.max(0, state.nextBossAt - state.kills)}`, 10, 64);
  drawLives();

  const gear = [
    `SH:${state.effects.shield}`,
    `MS:${state.effects.missile}`,
    `LZ:${state.effects.laser}`,
    `WG:${state.effects.wingman}`,
  ];
  ctx.fillStyle = "#9ef4ff";
  ctx.font = "11px 'Courier New', monospace";
  ctx.fillText(gear.join("  "), 10, 82);
}

function drawGameOver() {
  if (state.running) return;

  ctx.fillStyle = "rgba(8, 10, 20, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 8);
  ctx.font = "bold 16px 'Courier New', monospace";
  ctx.fillText(`SCORE ${state.score}`, canvas.width / 2, canvas.height / 2 + 24);
  ctx.fillText("PRESS R TO RESTART", canvas.width / 2, canvas.height / 2 + 52);
  ctx.textAlign = "start";
}

function draw() {
  drawBackground();
  drawPlayer();

  for (const e of enemies) drawEnemy(e);
  drawBoss();

  drawBullets();
  drawPowerups();
  drawHud();
  drawGameOver();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "s", "d", "w", "r"].includes(key)) {
    e.preventDefault();
  }

  if (key === "r" && !state.running) {
    reset();
    return;
  }

  state.keys.add(key);
});

window.addEventListener("keyup", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  state.keys.delete(key);
});

reset();
requestAnimationFrame(loop);
