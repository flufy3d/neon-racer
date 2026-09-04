import { lists, view } from '../core/state.js';
import { buildShip } from '../entities/ship.js';
import { initMeteors, makeCyberSun } from './sky.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function initScene() {
  view.scene = new THREE.Scene();
  view.scene.background = new THREE.Color(0x05050f);
  view.scene.fog = new THREE.Fog(0x05050f, 30, 150);

  view.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
  view.camera.position.set(0, 4.6, 8.5);
  view.camera.lookAt(0, 1, -12);

  view.renderer = new THREE.WebGLRenderer({ antialias: false });
  view.renderer.setSize(innerWidth, innerHeight);
  view.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(view.renderer.domElement);

  const pr = Math.min(devicePixelRatio, 2);
  const renderTarget = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, {
    type: THREE.HalfFloatType,
    samples: 0
  });
  view.composer = new EffectComposer(view.renderer, renderTarget);
  view.composer.setSize(innerWidth, innerHeight);
  view.composer.addPass(new RenderPass(view.scene, view.camera));
  view.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.1, 0.6, 0.25);
  view.composer.addPass(view.bloomPass);
  window.composer = view.composer;
  window.bloomPass = view.bloomPass;

  view.scene.add(new THREE.AmbientLight(0x5566aa, 1.6));
  const dir = new THREE.DirectionalLight(0xffffff, 2);
  dir.position.set(3, 8, 4);
  view.scene.add(dir);

  view.grid = new THREE.GridHelper(400, 100, 0x00ffff, 0x004466);
  view.grid.material.transparent = true;
  view.grid.material.opacity = 0.85;
  view.scene.add(view.grid);

  view.railMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  for (const x of [-5.4, 5.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 400), view.railMat);
    rail.position.set(x, 0.05, -150);
    view.scene.add(rail);
  }

  const sideFibreGeo = new THREE.BoxGeometry(0.12, 0.08, 400);
  const sideFibreMat = new THREE.MeshBasicMaterial({
    color: 0x9944ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  lists.sideFibres = [];
  for (const x of [-6.4, 6.4]) {
    const sf = new THREE.Mesh(sideFibreGeo, sideFibreMat);
    sf.position.set(x, 0.12, -150);
    sf.visible = false;
    view.scene.add(sf);
    lists.sideFibres.push(sf);
  }

  const starGeo1 = new THREE.BufferGeometry();
  const pos1 = [];
  for (let i = 0; i < 1300; i++) {
    pos1.push((Math.random() - 0.5) * 320, Math.random() * 85 + 4, -Math.random() * 240 - 20);
  }
  starGeo1.setAttribute('position', new THREE.Float32BufferAttribute(pos1, 3));
  view.deepStars = new THREE.Points(starGeo1, new THREE.PointsMaterial({ color: 0x88ccff, size: 0.42, transparent: true, opacity: 0.75 }));
  view.scene.add(view.deepStars);

  const starGeo2 = new THREE.BufferGeometry();
  const pos2 = [];
  for (let i = 0; i < 700; i++) {
    pos2.push((Math.random() - 0.5) * 160, Math.random() * 65 + 3, -Math.random() * 200 - 10);
  }
  starGeo2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  view.warpStars = new THREE.Points(starGeo2, new THREE.PointsMaterial({ color: 0xee77ff, size: 0.65, transparent: true, opacity: 0.6 }));
  view.scene.add(view.warpStars);

  view.cyberSun = makeCyberSun();
  view.scene.add(view.cyberSun);
  initMeteors();

  view.groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), view.groundGlowMat);
  view.groundGlow.name = 'groundGlow';
  view.groundGlow.rotation.x = -Math.PI / 2;
  view.groundGlow.position.set(0, 0.02, 0.35);
  view.scene.add(view.groundGlow);

  buildShip();
}

function onResize() {
  view.camera.aspect = innerWidth / innerHeight;
  view.camera.updateProjectionMatrix();
  view.renderer.setSize(innerWidth, innerHeight);
  view.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  view.composer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', onResize);

addEventListener('orientationchange', () => setTimeout(onResize, 350));

