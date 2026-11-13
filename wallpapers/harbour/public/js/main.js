// Starts the wallpaper. ?seed=123 repeats an island, N makes a new one.
(function (H) {
  'use strict';
  const sound = new H.Sound(document.getElementById('sound'));
  const world = new H.World(document.getElementById('stage'), sound);
  const asked = Number(new URLSearchParams(location.search).get('seed'));
  world.generate(asked || Math.floor(Math.random() * 1e9));
  world.start();
  const home = document.getElementById('home');   // the reset-zoom button, shown while zoomed
  if (home) { ['pointerdown', 'pointerup', 'pointercancel'].forEach(n => home.addEventListener(n, e => e.stopPropagation())); home.addEventListener('click', () => world.resetCamera()); }
  H.world = world;
})(window.Harbour);
