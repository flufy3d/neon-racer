import { run, view } from '../core/state.js';
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

// A fixed celestial sphere: one small point batch, never translated toward the
// player. Screen-space sizes are capped, and soft circular masks replace squares.
export function initSky() {
  let seed = 7319;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const positions = [], sizes = [], phases = [], colors = [];
  for (let i = 0; i < 850; i++) {
    const height = 0.10 + random() * 0.88;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - height * height);
    positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    sizes.push(0.9 + Math.pow(random(), 3) * 1.3);
    phases.push(random() * Math.PI * 2);
    const tint = random();
    colors.push(0.40 + tint * 0.16, 0.53 - tint * 0.08, 0.78);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('starSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    name: 'DistantNeonStars',
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: view.renderer.getPixelRatio() }
    },
    vertexShader: `
      attribute float starSize;
      attribute float phase;
      uniform float time;
      uniform float pixelRatio;
      varying vec3 starColor;
      varying float brightness;
      void main() {
        starColor = color;
        brightness = (0.72 + 0.12 * sin(time * 0.45 + phase))
          * smoothstep(0.10, 0.25, position.y);
        // Remove camera translation and pin depth to the far plane.
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = clip.xyww;
        gl_PointSize = starSize * pixelRatio;
      }
    `,
    fragmentShader: `
      varying vec3 starColor;
      varying float brightness;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float mask = 1.0 - smoothstep(0.05, 1.0, dot(p, p));
        gl_FragColor = vec4(starColor, mask * brightness);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  view.sky = new THREE.Points(geometry, material);
  view.sky.name = 'distantNeonStars';
  view.sky.frustumCulled = false;
  view.sky.renderOrder = -1000;
  view.scene.add(view.sky);

  // Preserve the original striped alien sun and its later-zone halo.
  view.cyberSun = makeCyberSun();
  view.scene.add(view.cyberSun);
}

export function updateSky(dt) {
  view.sky.material.uniforms.pixelRatio.value = view.renderer.getPixelRatio();
  if (run.paused) return;
  view.sky.material.uniforms.time.value += dt;
  const halo = view.singularityHalo;
  halo.rotation.z += dt * 0.35;
  const target = run.currentZoneIndex >= 3 ? 0.62 : 0;
  halo.material.opacity += (target - halo.material.opacity) * Math.min(1, dt * 2.5);
  halo.visible = halo.material.opacity > 0.01;
}
