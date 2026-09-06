import { MAX_TIER, TIER_COLORS } from '../core/constants.js';
import { run, view } from '../core/state.js';
import { BG_BASE, WHITE, tmpColA, tmpColB } from '../scene/palette.js';

// 物理热力学战斗机/火箭尾喷基色（烈焰超音速加力橙）
const PHYSICAL_PLUME_HEX = 0xff6600;

// 各形态的连续形变参数（下标 = 形态等级，帧间按 shipMorph 插值）
const MORPH = {
  noseLen:   [1, 1.05, 1.09, 1.14, 1.20, 1.32],
  hullBulk:  [1, 1.05, 1.14, 1.20, 1.26, 1.34],
  wingSpan:  [1, 1.03, 1.07, 1.12, 1.17, 1.24],
  wingSweep: [0.03, 0.11, 0.17, 0.23, 0.31, 0.42],
  wingRise:  [0, 0.05, 0.10, 0.14, 0.19, 0.27],
  tipFin:    [1, 1.15, 1.30, 1.50, 1.85, 2.70],
  flameLen:  [1, 1.30, 1.50, 1.75, 2.05, 2.50]
};

function curve(arr, m) {
  const i = Math.max(0, Math.min(arr.length - 1, Math.floor(m)));
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * Math.max(0, Math.min(1, m - i));
}

// 模块在 at-1 → at 之间完成展开
function seg(m, at) { return Math.max(0, Math.min(1, m - at + 1)); }

function tierColorAt(m, out) {
  const i = Math.max(0, Math.min(MAX_TIER, Math.floor(m)));
  const j = Math.min(MAX_TIER, i + 1);
  return out.setHex(TIER_COLORS[i]).lerp(tmpColB.setHex(TIER_COLORS[j]), Math.max(0, Math.min(1, m - i)));
}

// 按连续形态值 m 摆放机体每个部件 —— 形态切换是真正的机械变形
export function poseShip(m, t) {
  const p = view.ship.userData;
  const col = tierColorAt(m, tmpColA);
  view.shipGlowMat.color.copy(col);
  p.bodyMat.emissive.copy(col).multiplyScalar(0.07);
  p.plateMat.emissive.copy(col).multiplyScalar(0.1);
  p.trimMat.color.copy(col).lerp(WHITE, 0.18);
  p.cockpit.material.color.copy(col).lerp(WHITE, 0.45);

  const bulk = curve(MORPH.hullBulk, m);
  p.fuselage.scale.set(1 + (bulk - 1) * 0.8, bulk, 1 + (bulk - 1) * 0.35);
  p.noseGroup.scale.set(1 + (bulk - 1) * 0.6, 1 + (bulk - 1) * 0.6, curve(MORPH.noseLen, m));

  const lanceK = seg(m, 5);
  p.lance.visible = lanceK > 0.01;
  p.lance.scale.set(0.5 + 0.5 * lanceK, lanceK, 0.5 + 0.5 * lanceK);
  p.lance.position.z = -0.85 - 0.8 * lanceK;

  const span = curve(MORPH.wingSpan, m), sweep = curve(MORPH.wingSweep, m), rise = curve(MORPH.wingRise, m);
  const fin = curve(MORPH.tipFin, m);
  const spdRatio = Math.max(0, Math.min(1, (run.speed - 26) / 46));
  // 速度物理动力学：低速开局时喷焰收缩克制 (0.52x)，极速时全加力狂暴延伸至 1.62x
  const speedFlameK = 0.52 + spdRatio * 1.10;
  const flameLen = curve(MORPH.flameLen, m) * speedFlameK + Math.sin(t * 28) * (0.03 + spdRatio * 0.05);
  const podK = seg(m, 3), bladeK = seg(m, 4);

  for (const w of p.wings) {
    w.g.rotation.y = -w.side * sweep;
    w.g.rotation.z = w.side * rise;
    w.g.scale.x = span;
    w.tip.scale.y = fin;
    w.tip.position.y = 0.02 + (fin - 1) * 0.055;

    w.pod.visible = podK > 0.01;
    w.pod.scale.setScalar(0.35 + 0.65 * podK);
    w.pod.position.set(w.side * (0.38 + 0.2 * podK), -0.12 + 0.12 * podK, 0.2);
    w.podFlame.material.color.setHex(PHYSICAL_PLUME_HEX);
    w.podFlame.scale.set(1, flameLen * 0.8, 1);

    w.prong.visible = podK > 0.01;
    w.prong.scale.set(0.4 + 0.6 * podK, 0.4 + 0.6 * podK, podK);
    w.coil.rotation.z = t * 4;

    w.blade.visible = bladeK > 0.01;
    w.blade.scale.setScalar(0.3 + 0.7 * bladeK);
    w.blade.rotation.z = -w.side * 0.95 * bladeK;
  }

  const canK = seg(m, 1);
  for (const c of p.canards) {
    c.g.visible = canK > 0.01;
    c.g.scale.setScalar(0.25 + 0.75 * canK);
    c.g.rotation.z = c.side * (-1.15 + 1.4 * canK);
    c.g.rotation.y = -c.side * (0.5 - 0.32 * canK);
  }
  for (const v of p.vents) {
    v.m.visible = canK > 0.01;
    v.m.scale.set(1, 0.15 + 0.85 * canK, 1);
    v.m.rotation.z = v.side * 0.45 * canK;
    v.m.position.set(v.side * 0.2, 0.1 + 0.09 * canK, 0.68);
  }

  const plateK = seg(m, 2);
  const breathe = Math.sin(t * (run.shieldReady ? 3.4 : 1.6)) * (run.shieldReady ? 0.16 : 0.07);
  for (const pl of p.plates) {
    pl.g.visible = plateK > 0.01;
    pl.g.scale.setScalar(0.4 + 0.6 * plateK);
    pl.g.rotation.z = pl.sx * pl.sy * plateK * (0.5 + breathe);
    pl.g.rotation.y = -pl.sx * 0.14 * plateK;
    pl.g.position.set(pl.sx * (0.22 + 0.1 * plateK), pl.sy * (0.13 + 0.16 * plateK), 0.45);
  }

  const spineK = seg(m, 4);
  p.spine.visible = spineK > 0.01;
  p.spine.scale.set(1, spineK, 0.5 + 0.5 * spineK);
  p.spine.position.y = 0.04 - 0.14 * (1 - spineK);

  p.halo.visible = lanceK > 0.01;
  p.halo.scale.setScalar(0.3 + 0.7 * lanceK);
  p.halo.rotation.z = t * 1.4;
  p.halo.rotation.x = Math.PI / 2 + Math.sin(t * 1.1) * 0.55;
  p.halo.position.set(0, 0.62 + 0.24 * lanceK + Math.sin(t * 2.2) * 0.03, 0.3);
  for (const sh of p.shards) {
    sh.m.visible = lanceK > 0.01;
    const a = t * 1.7 + sh.i * Math.PI / 2;
    const r = 0.75 + 0.45 * lanceK;
    sh.m.position.set(Math.cos(a) * r, 0.3 + Math.sin(t * 2.4 + sh.i) * 0.22, 0.3 + Math.sin(a) * r * 0.7);
    sh.m.rotation.set(t * 2, t * 2.6, 0);
    sh.m.scale.setScalar(lanceK);
  }

  for (const b of p.boosters) {
    b.g.visible = lanceK > 0.01;
    b.g.scale.setScalar(0.3 + 0.7 * lanceK);
    b.g.position.set(b.side * (0.3 + 0.16 * lanceK), 0.18 + 0.18 * lanceK, 0.75);
    b.g.rotation.z = -b.side * 0.18 * lanceK;
    b.flame.material.color.setHex(PHYSICAL_PLUME_HEX);
    b.flame.scale.set(1, flameLen * 0.7, 1);
  }

  // ── 左右变轨动力推进物理学模拟（差动推力、矢量偏转、马赫环与 RCS 侧推） ──
  const steer = Math.max(-1, Math.min(1, run.latVel / (10 + run.speed * 0.16)));

  if (p.thrusters) {
    for (let i = 0; i < p.thrusters.length; i++) {
      const thruster = p.thrusters[i];
      // 变轨机动推力加力：内侧发动机维持 100% 满额基准推力（绝不缩短、不缩水、不稀疏），外侧发动机爆发增压加力（喷流拉长 35%）
      const isLeft = thruster.x < 0;
      const steerBoost = isLeft ? Math.max(0, steer * 0.35) : Math.max(0, -steer * 0.35);
      const curLen = flameLen * (1.0 + steerBoost);

      // 高频超音速湍流微颤 (38Hz)，速度越高颤动越剧烈
      const flutter = 1.0 + Math.sin(t * 38 + i * 2.1) * (0.02 + spdRatio * 0.035);

      // 喷管外层焰羽：低速纤细收敛 (0.60x)，高速克制扩张 (0.85x)，确保双发独立不粘连
      const nozzleExpand = (0.60 + spdRatio * 0.25) * (1.0 + steerBoost * 0.15);
      thruster.flame.material.color.setHex(PHYSICAL_PLUME_HEX);
      thruster.flame.scale.set(
        (1 + m * 0.05) * nozzleExpand,
        curLen * flutter,
        (1 + m * 0.05) * nozzleExpand
      );

      // 内层超高温白炽核心锥：修长锐利穿透
      thruster.flameCore.material.color.setHex(0xffffff);
      thruster.flameCore.scale.set(
        (1 + m * 0.03) * (0.58 + spdRatio * 0.24) * (1.0 + steerBoost * 0.12),
        curLen * (0.68 + spdRatio * 0.20) * flutter,
        (1 + m * 0.03) * (0.58 + spdRatio * 0.24) * (1.0 + steerBoost * 0.12)
      );

      // 推力矢量偏转角（TVC）：喷管朝机动反方向偏转以产生反冲力矩
      thruster.group.rotation.y = -steer * 0.22;

      // 3 组超音速马赫激波环 (Shock Diamonds)：低速收敛在喷口，高速大幅沿轴线拉伸并剧烈高频脉动
      if (thruster.diamonds) {
        for (let k = 0; k < thruster.diamonds.length; k++) {
          const d = thruster.diamonds[k];
          d.position.z = (0.18 + k * (0.22 + spdRatio * 0.16)) * Math.max(0.45, curLen);
          const pulse = 1.0 + Math.sin(t * (28 + spdRatio * 18) + k * 1.8 + i * 3.1) * (0.12 + spdRatio * 0.16);
          const diamondScale = (0.40 + spdRatio * 0.70) * (1.0 - k * 0.14) * pulse * (1.0 + steerBoost * 0.25);
          d.scale.setScalar(diamondScale);
          d.visible = curLen > 0.25;
        }
      }
    }
  } else {
    for (const f of p.flames) {
      f.material.color.setHex(PHYSICAL_PLUME_HEX);
      f.scale.set(1 + m * 0.05, flameLen, 1 + m * 0.05);
    }
    if (p.flameCores) {
      for (const fc of p.flameCores) {
        fc.material.color.setHex(0xffffff);
        fc.scale.set(1 + m * 0.03, flameLen * 0.85, 1 + m * 0.03);
      }
    }
  }

  // RCS 侧向姿态推进器喷焰控制
  if (p.rcs) {
    for (const r of p.rcs) {
      // 左侧 RCS (side = -1) 在向右变轨 (steer > 0) 时喷射；右侧 RCS (side = 1) 在向左变轨 (steer < 0) 时喷射
      const activeSteer = r.side < 0 ? Math.max(0, steer) : Math.max(0, -steer);
      if (activeSteer > 0.06) {
        const rcsFlicker = 0.85 + Math.sin(t * 45 + r.side) * 0.15;
        const rcsScale = activeSteer * rcsFlicker;
        r.plume.scale.set(rcsScale * 1.1, rcsScale * 1.5, rcsScale * 1.1);
        r.plume.visible = true;
      } else {
        r.plume.visible = false;
        r.plume.scale.set(0.001, 0.001, 0.001);
      }
    }
  }

  const aura = p.aura;
  aura.visible = plateK > 0.01;
  aura.material.color.copy(col);
  aura.rotation.x = Math.PI / 2;
  aura.rotation.z = t * 1.2;
  aura.position.set(0, -0.06, 0.25);
  aura.scale.setScalar((0.5 + 0.5 * plateK) * (1 + Math.sin(t * 5) * 0.05 + m * 0.02));

  const sb = p.shieldBubble;
  if (sb.visible) {
    sb.material.color.copy(col);
    sb.scale.setScalar(1 + Math.sin(t * 4) * 0.04 + (run.invuln > 0 ? Math.sin(t * 30) * 0.12 : 0));
    sb.material.opacity = run.invuln > 0 ? 0.35 : 0.16;
  }

  if (view.grid) {
    view.grid.material.color.copy(col).multiplyScalar(0.5);
    view.railMat.color.copy(col).multiplyScalar(0.9);
    view.scene.background.copy(BG_BASE).lerp(col, 0.05);
    if (view.groundGlowMat) view.groundGlowMat.color.copy(col);
  }
}

export function updateShipMorph(dt, t) {
  run.shipMorph += (run.tier - run.shipMorph) * Math.min(1, dt * 3.2);
  if (Math.abs(run.tier - run.shipMorph) < 0.002) run.shipMorph = run.tier;
  poseShip(run.shipMorph, t);
}

