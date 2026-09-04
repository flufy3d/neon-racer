import { view } from '../core/state.js';
import * as THREE from 'three';

export function makeCyberSun() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffee33');
  grad.addColorStop(0.5, '#ff2277');
  grad.addColorStop(1.0, '#7700aa');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(128, 128, 120, 0, Math.PI * 2);
  g.fill();

  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) {
    const y = 138 + i * 12;
    const h = 2 + i * 1.5;
    g.fillRect(0, y, 256, h);
  }
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    fog: false,
    depthWrite: false
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat);
  plane.position.set(0, 22, -260);
  plane.name = 'cyberSun';

  const haloGeo = new THREE.RingGeometry(42, 60, 48);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x00ffaa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  view.singularityHalo = new THREE.Mesh(haloGeo, haloMat);
  view.singularityHalo.position.set(0, 0, -1);
  view.singularityHalo.name = 'singularityHalo';
  view.singularityHalo.visible = false;
  plane.add(view.singularityHalo);

  return plane;
}

const meteorGeo = new THREE.BoxGeometry(0.18, 0.18, 9.0);

const meteorMat = new THREE.MeshBasicMaterial({ color: 0xaaffff, transparent: true, opacity: 0, fog: false });

export const meteors = [];

export function initMeteors() {
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(meteorGeo, meteorMat.clone());
    m.visible = false;
    view.scene.add(m);
    meteors.push({
      mesh: m,
      active: false,
      timer: 1.2 + i * 2.4,
      progress: 0,
      startX: 0, startY: 0, startZ: 0,
      endX: 0, endY: 0, endZ: 0
    });
  }
}

export function updateMeteors(dt) {
  for (const met of meteors) {
    if (!met.active) {
      met.timer -= dt;
      if (met.timer <= 0) {
        met.active = true;
        met.progress = 0;
        const side = Math.random() < 0.5 ? -1 : 1;
        met.startX = side * (32 + Math.random() * 38);
        met.startY = 22 + Math.random() * 14;
        met.startZ = -210 - Math.random() * 40;
        met.endX = met.startX * 0.15;
        met.endY = 12 + Math.random() * 6;
        met.endZ = met.startZ + 70 + Math.random() * 30;
        met.mesh.position.set(met.startX, met.startY, met.startZ);
        met.mesh.lookAt(met.endX, met.endY, met.endZ);
        met.mesh.visible = true;
      }
    } else {
      met.progress += dt * 1.8;
      if (met.progress >= 1) {
        met.active = false;
        met.mesh.visible = false;
        met.timer = 2.0 + Math.random() * 3.5;
      } else {
        const k = met.progress;
        met.mesh.position.set(
          met.startX + (met.endX - met.startX) * k,
          met.startY + (met.endY - met.startY) * k,
          met.startZ + (met.endZ - met.startZ) * k
        );
        const alpha = Math.sin(k * Math.PI);
        met.mesh.material.opacity = alpha * 0.85;
      }
    }
  }
}

