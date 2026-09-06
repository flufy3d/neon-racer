import { view } from '../core/state.js';
import * as THREE from 'three';

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(90,255,255,0.55)');
  grad.addColorStop(1, 'rgba(0,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export const orbHaloMat = new THREE.SpriteMaterial({ map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

function makeGroundGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.__isPureWhiteGradient = true;
  return tex;
}

view.groundGlowMat = new THREE.MeshBasicMaterial({
  map: makeGroundGlowTexture(),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.45
});

export function makeNeonSparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.28, 'rgba(210,240,255,0.35)');
  grad.addColorStop(0.55, 'rgba(140,200,255,0.06)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function makeJetNeedleTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 32, 0, 16, 32, 28);
  grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.18, 'rgba(220,250,255,0.75)');
  grad.addColorStop(0.45, 'rgba(120,210,255,0.2)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function makeNeonStarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  // Center glow
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 28);
  grad.addColorStop(0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.25, 'rgba(230,245,255,0.7)');
  grad.addColorStop(0.6, 'rgba(160,210,255,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);

  // Cross flares
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.moveTo(32, 6);
  g.lineTo(33.5, 30.5);
  g.lineTo(58, 32);
  g.lineTo(33.5, 33.5);
  g.lineTo(32, 58);
  g.lineTo(30.5, 33.5);
  g.lineTo(6, 32);
  g.lineTo(30.5, 30.5);
  g.closePath();
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function makeShockwaveRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);

  // Outer soft resonance ring
  const grad = g.createRadialGradient(64, 64, 28, 64, 64, 63);
  grad.addColorStop(0.0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.08)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.88, 'rgba(255,255,255,0.95)'); // sharp intense primary energy ring
  grad.addColorStop(0.95, 'rgba(210,245,255,0.4)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);

  // Inner subtle secondary harmonic ring
  const g2 = g.createRadialGradient(64, 64, 16, 64, 64, 38);
  g2.addColorStop(0.0, 'rgba(255,255,255,0)');
  g2.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  g2.addColorStop(0.75, 'rgba(255,255,255,0.7)');
  g2.addColorStop(0.9, 'rgba(255,255,255,0.1)');
  g2.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = g2;
  g.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export const neonSparkTex = makeNeonSparkTexture();
export const neonStarTex = makeNeonStarTexture();
export const jetNeedleTex = makeJetNeedleTexture();
export const shockwaveRingTex = makeShockwaveRingTexture();


