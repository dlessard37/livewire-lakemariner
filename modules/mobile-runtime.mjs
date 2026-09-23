/** Phone rendering policy. Physics always keeps its own fixed simulation rate. */
export function readTouchMode(win) {
  const qa = new URLSearchParams(win.location.search).get('qa') === '1';
  if (qa && typeof win.__LW_QA_TOUCH__ === 'boolean') return win.__LW_QA_TOUCH__;
  if (qa && new URLSearchParams(win.location.search).get('touch') === '1') return true;
  return Boolean(win.matchMedia?.('(any-pointer: coarse)').matches || win.matchMedia?.('(pointer: coarse)').matches);
}

export function createRenderBudget({ touch = false } = {}) {
  let phone = Boolean(touch), level = 0, samples = [], slowWindows = 0, fastWindows = 0;
  const scales = [1, 0.85, 0.70, 0.58];
  const policy = {
    setTouch(value) { const next = Boolean(value); if (phone === next) return false; phone = next; level = 0; policy.resetSamples(); return true; },
    resetSamples() { samples = []; slowWindows = 0; fastWindows = 0; },
    pixelRatio(width, height, deviceRatio = 1) {
      const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
      const cap = phone ? 1.25 : 2;
      const pixelBudget = phone ? 1000000 : 2800000;
      return Math.max(0.25, Math.min(Math.max(0.25, Number(deviceRatio) || 1), cap, Math.sqrt(pixelBudget / (w * h))) * scales[level]);
    },
    // Sample only active, rendered frames. Loading, hidden tabs and debugger pauses
    // must never force the phone permanently into a low-resolution tier.
    sample(milliseconds, { active = true } = {}) {
      if (!active || !Number.isFinite(milliseconds) || milliseconds < 4 || milliseconds > 120) { policy.resetSamples(); return false; }
      samples.push(milliseconds);
      if (samples.length < 90) return false;
      const sorted = samples.slice().sort((a,b) => a-b);
      const p75 = sorted[Math.floor(sorted.length * .75)]; samples = [];
      slowWindows = p75 > 24 ? slowWindows + 1 : 0;
      fastWindows = p75 < 17.8 ? fastWindows + 1 : 0;
      if (slowWindows >= 2 && level < scales.length - 1) { level++; policy.resetSamples(); return true; }
      if (fastWindows >= 4 && level > 0) { level--; policy.resetSamples(); return true; }
      return false;
    },
    lowerAfterContextLoss() { level = Math.min(level + 1, scales.length - 1); policy.resetSamples(); },
    get touch() { return phone; },
    inspect() { return { touch: phone, level, scale: scales[level], maxPixels: phone ? 1000000 : 2800000, maxDpr: phone ? 1.25 : 2, samples: samples.length }; },
  };
  return policy;
}

export function choosePostProcessing({ touch, floatColor, halfFloatColor, maxSamples }) {
  // The composite shader already provides edge smoothing. Avoid the extra
  // multisampled HDR color/depth buffers on phones, even when supported.
  return { hdr: Boolean(floatColor || halfFloatColor), samples: touch ? 0 : Math.min(2, Math.max(0, maxSamples || 0)), bloom: !touch };
}

/** Measures the actual HUD and visible viewport; no UA-specific guessed heights. */
export function observeMobileLayout(win, doc) {
  const root = doc.documentElement, hud = doc.querySelector('.hud-top');
  let queued = false;
  const refresh = () => {
    queued = false;
    const vv = win.visualViewport;
    root.style.setProperty('--lw-visible-height', `${Math.round(vv?.height || win.innerHeight)}px`);
    root.style.setProperty('--lw-visible-top', `${Math.round(vv?.offsetTop || 0)}px`);
    if (hud) root.style.setProperty('--lw-hud-bottom', `${Math.ceil(hud.getBoundingClientRect().bottom + 8)}px`);
  };
  const schedule = () => { if (!queued) { queued = true; win.requestAnimationFrame(refresh); } };
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  if (hud) observer?.observe(hud);
  win.addEventListener('resize', schedule); win.visualViewport?.addEventListener('resize', schedule); win.visualViewport?.addEventListener('scroll', schedule);
  refresh();
  return { refresh, dispose() { observer?.disconnect(); win.removeEventListener('resize', schedule); win.visualViewport?.removeEventListener('resize', schedule); win.visualViewport?.removeEventListener('scroll', schedule); } };
}
