import { run, view } from '../core/state.js';
import { poseShip } from './ship-pose.js';
import * as THREE from 'three';

export function buildShip() {
  view.ship = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14142a, metalness: 0.9, roughness: 0.25, emissive: 0x000000 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1c1c3a, metalness: 0.85, roughness: 0.3, emissive: 0x000000 });
  view.shipGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false });
  const flameMat = () => new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.62, fog: false });
  const p = { bodyMat, plateMat };
  // ── 主体: 机腹 + 机首(可拉长) + 座舱 ──
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.5), bodyMat);
  fuselage.position.set(0, 0, 0.35);
  view.ship.add(fuselage);
  p.fuselage = fuselage;

  const noseGroup = new THREE.Group();
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.7, 4), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  noseGroup.add(nose);
  const lance = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.6, 6), view.shipGlowMat); // T5 破风长矛
  lance.rotation.x = -Math.PI / 2;
  noseGroup.add(lance);
  view.ship.add(noseGroup);
  p.noseGroup = noseGroup;
  p.lance = lance;

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x66ffff, fog: false }));
  cockpit.position.set(0, 0.22, 0.1);
  view.ship.add(cockpit);
  p.cockpit = cockpit;

  addShipWings(view.ship, p, bodyMat, plateMat, view.shipGlowMat, trimMat, flameMat);

  // ── T1 鸭翼(从机身折出) + 过载散热鳍 ──
  p.canards = [];
  for (const side of [-1, 1]) {
    const c = new THREE.Group();
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.26), bodyMat);
    fin.position.x = side * 0.23;
    c.add(fin);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.06), view.shipGlowMat);
    edge.position.set(side * 0.23, 0.04, -0.1);
    c.add(edge);
    c.position.set(side * 0.16, 0.06, -0.52);
    view.ship.add(c);
    p.canards.push({ g: c, side });
  }

  p.vents = [];
  for (const side of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.46), plateMat);
    view.ship.add(v);
    p.vents.push({ m: v, side });
  }

  // ── T2 铰接式装甲板(上下左右四片, 沿机身张开) ──
  p.plates = [];
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1, sy = i % 2 ? 1 : -1;
    const hinge = new THREE.Group();
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.86), plateMat);
    pl.position.x = sx * 0.2;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.88), view.shipGlowMat);
    edge.position.set(sx * 0.38, sy * 0.04, 0);
    pl.add(edge);
    hinge.add(pl);
    view.ship.add(hinge);
    p.plates.push({ g: hinge, sx, sy });
  }

  // ── T4 背鳍 + 外露反应堆 ──
  const spine = new THREE.Group();
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.9), plateMat);
  dorsal.position.y = 0.33;
  spine.add(dorsal);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.86, 8), view.shipGlowMat);
  core.rotation.x = Math.PI / 2;
  core.position.y = 0.12;
  spine.add(core);
  spine.position.set(0, 0.04, 0.46);
  view.ship.add(spine);
  p.spine = spine;

  // ── T5 背部量子推进器 ──
  p.boosters = [];
  for (const side of [-1, 1]) {
    const b = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.52, 8), bodyMat);
    shell.rotation.x = Math.PI / 2;
    b.add(shell);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 8), view.shipGlowMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.z = 0.25;
    b.add(lip);
    const bf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.85, 8), flameMat());
    bf.rotation.x = -Math.PI / 2;
    bf.position.z = 0.68;
    b.add(bf);
    view.ship.add(b);
    p.boosters.push({ g: b, side, flame: bf });
  }

  // ── T5 量子光环 + 环绕晶体 ──
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.028, 8, 32), view.shipGlowMat);
  halo.rotation.x = Math.PI / 2;
  view.ship.add(halo);
  p.halo = halo;

  p.shards = [];
  for (let i = 0; i < 4; i++) {
    const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), view.shipGlowMat);
    view.ship.add(sh);
    p.shards.push({ m: sh, i });
  }

  // ── 主引擎 ──
  p.flames = [];
  for (const x of [-0.3, 0.3]) {
    const engine = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), view.shipGlowMat);
    engine.position.set(x, 0, 1.02);
    view.ship.add(engine);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 8), flameMat());
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0, 1.62);
    view.ship.add(flame);
    p.flames.push(flame);
  }

  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  shieldBubble.visible = false;
  view.ship.add(shieldBubble);
  p.shieldBubble = shieldBubble;

  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.04, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false })
  );
  aura.visible = false;
  view.ship.add(aura);
  p.aura = aura;
  p.trimMat = trimMat;

  view.ship.userData = p;
  view.ship.position.set(0, 0.95, 0);
  view.scene.add(view.ship);
  poseShip(0, 0);
}

function addShipWings(ship, p, bodyMat, plateMat, shipGlowMat, trimMat, flameMat) {
p.wings = [];
for (const side of [-1, 1]) {
  const g = new THREE.Group();
  g.position.set(side * 0.24, -0.06, 0.05);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.09, 0.62), bodyMat);
  panel.position.x = side * 0.36;
  g.add(panel);

  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.66), trimMat);
  tip.position.set(side * 0.72, 0.02, 0);
  g.add(tip);

  const blade = new THREE.Group();                       // T4 副翼下张
  const bladePanel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.44), plateMat);
  bladePanel.position.x = side * 0.32;
  blade.add(bladePanel);
  const bladeEdge = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.025, 0.07), shipGlowMat);
  bladeEdge.position.set(side * 0.32, 0.05, -0.2);
  blade.add(bladeEdge);
  blade.position.set(side * 0.38, -0.03, 0.08);
  g.add(blade);

  const pod = new THREE.Group();                         // T3 外侧引擎荚
  const podShell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.62, 10), bodyMat);
  podShell.rotation.x = Math.PI / 2;
  pod.add(podShell);
  const podLip = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 10), shipGlowMat);
  podLip.rotation.x = Math.PI / 2;
  podLip.position.z = 0.3;
  pod.add(podLip);
  const podFlame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 8), flameMat());
  podFlame.rotation.x = -Math.PI / 2;
  podFlame.position.z = 0.82;
  pod.add(podFlame);
  g.add(pod);

  const prong = new THREE.Group();                       // T3 磁力叉
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.95), bodyMat);
  arm.position.z = -0.48;
  prong.add(arm);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 18), shipGlowMat);
  coil.position.z = -0.95;
  prong.add(coil);
  prong.position.set(side * 0.5, 0.02, -0.15);
  g.add(prong);

  ship.add(g);
  p.wings.push({ g, side, tip, blade, pod, podFlame, prong, coil });
}

}

export function applyShipTier() {
  view.ship.userData.shieldBubble.visible = run.tier >= 2 && run.shieldReady;
}

