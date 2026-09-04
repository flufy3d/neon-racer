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

