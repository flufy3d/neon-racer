// 电视档位的后期管线（替代 EffectComposer + UnrealBloomPass）。
//
// 原 UnrealBloom：场景 → HalfFloat 离屏 → 1/4 高亮提取 → 5 级 mip 各两次可分离模糊
// → 1/4 合成 → 全屏合成上屏。电视盒子的 Mali 带宽很紧，这里给出两种更便宜的做法：
//
//   lite：场景 → RGBA8 离屏 → 1/4 高亮提取（4 点采样）→ 1/4 与 1/16 两级模糊 → 全屏合成上屏。
//         只保留一次全分辨率读写，近处细辉光与远处大光晕各一级，观感接近原版。
//   off ：不经过离屏缓冲，直接渲染到画布。辉光只剩材质自身的加法混合光晕。
//
// 开始页 / 结算页上 3D 场景被面板盖住，两种档位都直接上屏（省下辉光与合成 pass）。
//
// 对外接口与 EffectComposer / UnrealBloomPass 对齐（render / setSize / setPixelRatio /
// strength / enabled），setup.js 把它同时挂到 view.composer 与 view.bloomPass。
//
// 颜色空间：原管线最终由 ShaderMaterial 原样输出离屏缓冲里的线性值（不做 sRGB 编码），
// 这里保持一致；直接上屏时（off 档位 / 被面板盖住）把 outputColorSpace 设为线性，色调相同。
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// 2x2 个双线性采样覆盖 4x4 源像素，逐点阈值后平均：细霓虹线在降采样后不至于被平均到阈值以下
const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 texel;
uniform float threshold;
varying vec2 vUv;
vec3 pick(vec2 uv) {
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return c * smoothstep(threshold, threshold + 0.01, l);
}
void main() {
  vec3 c = pick(vUv + texel * vec2(-1.0, -1.0)) + pick(vUv + texel * vec2(1.0, -1.0))
         + pick(vUv + texel * vec2(-1.0, 1.0)) + pick(vUv + texel * vec2(1.0, 1.0));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

// 4 点平均降采样（1/4 → 1/16 两次减半合成一次完成）
const DOWN_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(1.0, -1.0)).rgb
         + texture2D(tDiffuse, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

// 9 点高斯用 5 次线性插值采样实现（经典 offset/weight 表）
const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  vec2 o1 = dir * 1.3846153846;
  vec2 o2 = dir * 3.2307692308;
  c += (texture2D(tDiffuse, vUv + o1).rgb + texture2D(tDiffuse, vUv - o1).rgb) * 0.3162162162;
  c += (texture2D(tDiffuse, vUv + o2).rgb + texture2D(tDiffuse, vUv - o2).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tBase;
uniform sampler2D tNear;
uniform sampler2D tFar;
uniform float nearK;
uniform float farK;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tBase, vUv).rgb + texture2D(tNear, vUv).rgb * nearK + texture2D(tFar, vUv).rgb * farK;
  gl_FragColor = vec4(c, 1.0);
}`;

// 原 UnrealBloom 参数：threshold 0.25，radius 0.6 → 5 级权重 [.52 .56 .60 .64 .68]。
// 近级对应前两级（≈1.08），远级对应后三级（≈1.92）；再按实测截图微调。
const THRESHOLD = 0.25;
const NEAR_WEIGHT = 1.0;
const FAR_WEIGHT = 1.7;

function makeRT(depth) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: depth, stencilBuffer: false });
  rt.texture.generateMipmaps = false;
  return rt;
}

export class TvPipeline {
  constructor(renderer, scene, camera, mode) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.mode = mode;
    this.strength = 1.1;
    this.enabled = true;
    this._pixelRatio = renderer.getPixelRatio();
    this._width = 1;
    this._height = 1;
    // 开始页 / 结算页被近乎不透明的面板盖住：这时跳过辉光直接上屏（由 session.js 切换）
    this.overlay = true;
    // 离屏缓冲本来就是线性输出；直接上屏也用线性，色调一致且着色器程序可复用（不触发重新编译）
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    if (mode === 'off') return;
    this.rtScene = makeRT(true);
    this.rtNear = makeRT(false);
    this.rtNear2 = makeRT(false);
    this.rtFar = makeRT(false);
    this.rtFar2 = makeRT(false);
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false
    });
    this.brightMat = mat(BRIGHT_FRAG, { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: THRESHOLD } });
    this.downMat = mat(DOWN_FRAG, { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() } });
    this.blurMat = mat(BLUR_FRAG, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
    this.compositeMat = mat(COMPOSITE_FRAG, {
      tBase: { value: this.rtScene.texture }, tNear: { value: this.rtNear.texture }, tFar: { value: this.rtFar.texture },
      nearK: { value: 0 }, farK: { value: 0 }
    });
    this.quad = new FullScreenQuad(null);
  }

  setPixelRatio(pr) {
    this._pixelRatio = pr;
    this.setSize(this._width, this._height);
  }

  setSize(width, height) {
    this._width = width;
    this._height = height;
    if (this.mode === 'off') return;
    const w = Math.max(1, Math.round(width * this._pixelRatio));
    const h = Math.max(1, Math.round(height * this._pixelRatio));
    const nw = Math.max(1, Math.round(w / 4)), nh = Math.max(1, Math.round(h / 4));
    const fw = Math.max(1, Math.round(nw / 4)), fh = Math.max(1, Math.round(nh / 4));
    this.rtScene.setSize(w, h);
    this.rtNear.setSize(nw, nh);
    this.rtNear2.setSize(nw, nh);
    this.rtFar.setSize(fw, fh);
    this.rtFar2.setSize(fw, fh);
    this.nearSize = [nw, nh];
    this.farSize = [fw, fh];
    this.sceneSize = [w, h];
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  _blur(src, tmp, size) {
    const u = this.blurMat.uniforms;
    u.tDiffuse.value = src.texture;
    u.dir.value.set(1 / size[0], 0);
    this._pass(this.blurMat, tmp);
    u.tDiffuse.value = tmp.texture;
    u.dir.value.set(0, 1 / size[1]);
    this._pass(this.blurMat, src);
  }

  render() {
    const r = this.renderer;
    if (this.mode === 'off' || !this.enabled || this.overlay) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    r.setRenderTarget(this.rtScene);
    r.render(this.scene, this.camera);

    const b = this.brightMat.uniforms;
    b.tDiffuse.value = this.rtScene.texture;
    b.texel.value.set(1 / this.sceneSize[0], 1 / this.sceneSize[1]);
    this._pass(this.brightMat, this.rtNear);
    this._blur(this.rtNear, this.rtNear2, this.nearSize);

    const d = this.downMat.uniforms;
    d.tDiffuse.value = this.rtNear.texture;
    d.texel.value.set(1 / this.nearSize[0], 1 / this.nearSize[1]);
    this._pass(this.downMat, this.rtFar);
    this._blur(this.rtFar, this.rtFar2, this.farSize);

    const c = this.compositeMat.uniforms;
    c.nearK.value = this.strength * NEAR_WEIGHT;
    c.farK.value = this.strength * FAR_WEIGHT;
    this._pass(this.compositeMat, null);
  }
}
