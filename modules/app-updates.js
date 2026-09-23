import { PREVIEW_MODE, BUILD_VERSION } from './config.js';

// QA frames do not register a worker or acquire an old production cache.
if (!PREVIEW_MODE && 'serviceWorker' in navigator && new URLSearchParams(location.search).get('qa') !== '1') {
  let notified = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const reload = () => {
    try { window.LW?.saveCheckpoint?.(); } catch (_) {}
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (notified || !hadController) return;
    notified = true;
    if (!window.LW || window.LW.state.mode === 'title') { reload(); return; }
    const button = document.createElement('button');
    button.textContent = 'Game update ready · save and reload';
    button.setAttribute('aria-live','polite');
    button.style.cssText = 'position:fixed;left:12px;right:12px;bottom:max(14px,env(safe-area-inset-bottom));z-index:10000;min-height:48px;padding:12px;background:#d6f04a;color:#172020;border:2px solid #172020;border-radius:6px;font:bold 16px system-ui;';
    button.onclick = reload;
    document.body.append(button);
  });
  navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(registration => {
    registration.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update().catch(() => {});
    });
  }).catch(error => console.warn('[LW] App update unavailable', error));
}
const buildLabel = document.querySelector('#build-version');
if (buildLabel) buildLabel.textContent = BUILD_VERSION;
