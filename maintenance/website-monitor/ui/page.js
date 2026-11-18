// Reloads the status page every minute, but never while someone is editing a site.
setInterval(function () {
  if (document.querySelector('details[open]') || (document.activeElement && document.activeElement.matches('input'))) return;
  if (Array.from(document.querySelectorAll('input[name=url]')).some(function (i) { return i.value && !i.defaultValue; })) return;
  location.reload();
}, 60000);
