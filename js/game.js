import { run, view } from './core/state.js';
import { animate } from './game/loop.js';
import { initScene } from './scene/setup.js';
import * as ui from './ui.js';
import * as THREE from 'three';
import './game/input.js';        // 注册键鼠触控事件
import './scene/textures.js';    // 程序化贴图与依赖它的材质
import './debug/inspect.js';     // window.__neon 取证接口

initScene();

ui.initUI(view.camera);

ui.els.bestEl.textContent = run.best;

view.clock = new THREE.Clock();

animate();

