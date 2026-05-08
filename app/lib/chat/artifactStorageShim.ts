/**
 * In-memory localStorage/sessionStorage shim for sandboxed artifact iframes
 * (srcdoc + CSP without allow-same-origin → storage APIs unavailable).
 * Injected as inline script ahead of artifact boot code.
 */
export const DOME_IFRAME_STORAGE_SHIM_SCRIPT = `
(function() {
  function makeStore(name) {
    var map = {};
    return {
      getItem: function(k) {
        return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
      },
      setItem: function(k, v) {
        map[String(k)] = String(v);
      },
      removeItem: function(k) {
        delete map[String(k)];
      },
      clear: function() {
        map = {};
      },
      key: function(i) {
        var ks = Object.keys(map);
        return ks[i] == null ? null : ks[i];
      },
      get length() {
        return Object.keys(map).length;
      }
    };
  }
  try {
    Object.defineProperty(window, 'localStorage', { value: makeStore('local'), configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: makeStore('session'), configurable: true });
  } catch (e) {}
})();`.trim();
