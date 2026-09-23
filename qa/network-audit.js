// Load this classic script FIRST in the review page's <head>, before all other scripts.
// It instruments only ?qa=1 and does not enable any cloud service.
(() => {
  if (new URLSearchParams(location.search).get('qa') !== '1') return;
  const audit = window.__LW_NETWORK_AUDIT__ = { attempted: [], resources: [], errors: [], csp: [], started: performance.now() };
  const isProduction = (raw) => {
    try {
      const u = new URL(raw, document.baseURI);
      return /(^|\.)(firestore\.googleapis\.com|firebasestorage\.googleapis\.com|storage\.googleapis\.com|googletagmanager\.com|google-analytics\.com|analytics\.google\.com)$/.test(u.hostname)
        || /(^|\.)livewire-lakemariner\.(web\.app|firebaseapp\.com|firebasestorage\.app)$/.test(u.hostname);
    } catch { return false; }
  };
  const check = (url, method) => {
    if (!isProduction(url)) return;
    audit.attempted.push({ url: String(url), method, at: performance.now() });
    throw new Error('QA blocked attempted production request: ' + method + ' ' + url);
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, options) {
    const url = input instanceof Request ? input.url : input;
    try { check(url, options?.method || (input instanceof Request ? input.method : 'GET')); }
    catch (error) { return Promise.reject(error); }
    return nativeFetch(input, options);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    check(url, method);
    return open.call(this, method, url, ...args);
  };
  const sendBeacon = navigator.sendBeacon?.bind(navigator);
  if (sendBeacon) navigator.sendBeacon = (url, data) => { check(url, 'BEACON'); return sendBeacon(url, data); };
  for (const name of ['WebSocket', 'EventSource']) {
    const Native = window[name];
    if (Native) window[name] = new Proxy(Native, { construct(target, args) { check(args[0], name); return Reflect.construct(target, args); } });
  }
  addEventListener('error', (e) => audit.errors.push({ message: e.message || 'resource load failure', filename: e.filename || e.target?.src || '' }), true);
  addEventListener('unhandledrejection', (e) => audit.errors.push({ message: String(e.reason?.stack || e.reason) }));
  addEventListener('securitypolicyviolation', (e) => audit.csp.push({ uri: e.blockedURI, directive: e.violatedDirective }));
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (isProduction(e.name)) audit.resources.push({ url: e.name, kind: e.initiatorType });
  }).observe({ type: 'resource', buffered: true });
})();
