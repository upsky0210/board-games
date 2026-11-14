/* ==========================================================================
   阿喵老師的棋藝教室：五款遊戲共用的程式 (T21)
   每款遊戲的 index.html 會在主程式之前載入這個檔案。
   注意：這裡宣告的 let / function 是所有遊戲共用的全域名稱，遊戲裡不要再宣告同名的變數。
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. 局號機制：每次重開 gameEpoch +1，舊局尚未跑完的計時器與動畫回呼會自動失效
   -------------------------------------------------------------------------- */
let gameEpoch = 0;

function later(fn, ms) {
  const ep = gameEpoch;
  return setTimeout(() => {
    if (ep !== gameEpoch) return;
    markActivity(); // 電腦出手等延遲動作可能改變畫面，喚醒重繪
    fn();
  }, ms);
}

/* --------------------------------------------------------------------------
   2. 彩帶：函式庫若未載入 (例如學校網路擋 CDN) 就略過，不影響勝利視窗
   -------------------------------------------------------------------------- */
function fireConfetti(opts) {
  if (typeof window.confetti === 'function') window.confetti(opts);
}

/* --------------------------------------------------------------------------
   3. 釋放 3D 資源 (T14)
   從場景移除物件後呼叫 removeAndDispose，釋放幾何、材質與貼圖佔用的記憶體。
   多個物件共用的快取材質或貼圖，建立時用 markShared 登記，就不會被釋放。
   -------------------------------------------------------------------------- */
const SHARED_RESOURCES = new Set();
const TEXTURE_SLOTS = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap'];

function markShared(...items) {
  items.flat().forEach(item => { if (item) SHARED_RESOURCES.add(item); });
  return items[0];
}

function disposeObject3D(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse(obj => {
    if (obj.geometry && !SHARED_RESOURCES.has(obj.geometry)) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    mats.forEach(mat => {
      if (SHARED_RESOURCES.has(mat)) return;
      TEXTURE_SLOTS.forEach(slot => {
        const tex = mat[slot];
        if (tex && !SHARED_RESOURCES.has(tex)) tex.dispose();
      });
      mat.dispose();
    });
  });
}

function removeAndDispose(obj, parent) {
  if (!obj) return;
  const from = parent || obj.parent;
  if (from) from.remove(obj);
  disposeObject3D(obj);
}

/* --------------------------------------------------------------------------
   4. 畫面有變化才重繪 (T15)
   有操作、動畫或電腦出手時全速繪製；靜止 1.5 秒後停止繪製。
   若畫面上有「呼吸」效果 (提示光圈、選取中的棋子等)，靜止時改為每秒約 15 張。
   遊戲裡的 requestAnimationFrame 會自動被視為「有動畫」，不需要另外處理。
   -------------------------------------------------------------------------- */
const RENDER_IDLE_MS = 1500;
const IDLE_EFFECT_INTERVAL_MS = 66;
let lastActivityTime = performance.now();
let lastRenderTime = 0;

function markActivity() {
  lastActivityTime = performance.now();
}

const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = function (callback) {
  markActivity();
  return nativeRequestAnimationFrame(callback);
};

['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'click', 'resize', 'focus'].forEach(type => {
  window.addEventListener(type, markActivity, { capture: true, passive: true });
});

// options: { renderer, scene, camera, controls, onFrame(now), hasIdleEffects() }
function startRenderLoop(options) {
  const { renderer, scene, camera, controls, onFrame, hasIdleEffects } = options;
  if (controls) controls.addEventListener('change', markActivity);

  function loop(now) {
    nativeRequestAnimationFrame(loop);
    if (controls) controls.update(); // 視角阻尼仍在滑動時會觸發 change 事件

    const active = (now - lastActivityTime) < RENDER_IDLE_MS;
    if (!active) {
      const effects = hasIdleEffects ? hasIdleEffects() : false;
      if (!effects || (now - lastRenderTime) < IDLE_EFFECT_INTERVAL_MS) return;
    }

    if (onFrame) onFrame(now);
    renderer.render(scene, camera);
    lastRenderTime = now;
  }
  nativeRequestAnimationFrame(loop);
}
