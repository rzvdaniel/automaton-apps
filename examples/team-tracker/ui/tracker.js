AutomatonUI.bindThemeToggle();
document.querySelectorAll('input[data-remember]').forEach(function (input) {
  input.value = localStorage.getItem('tracker-name') || '';
  input.addEventListener('change', function () { localStorage.setItem('tracker-name', input.value); });
});
document.addEventListener('submit', function (event) {
  var name = event.target.querySelector('input[data-remember]');
  if (name) localStorage.setItem('tracker-name', name.value);
});
