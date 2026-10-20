/** The only client JS. Served from a string because tsc (rootDir: src) does not copy non-TS assets to dist. */
export const APP_JS = `document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-copy-target],[data-copy-text]');
  if (!b) return;
  var text = b.dataset.copyText != null ? b.dataset.copyText : (document.querySelector(b.dataset.copyTarget) || {}).textContent || '';
  var done = function () { var old = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1500); };
  if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done); }
  else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
});
`;
