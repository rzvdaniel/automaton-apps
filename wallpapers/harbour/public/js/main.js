// Starts the wallpaper: makes the parts, connects them, builds an island and starts the clock.
// ?seed=123 repeats an island; N makes a new one; ?debug shows everything (see README).
import { World } from './engine/world.js';
import { Sound } from './audio/sound.js';
import { Controls } from './ui/controls.js';
import { Gull, GullFlock } from './entities/gulls.js';

const sound = new Sound();
const world = new World({ stage: document.getElementById('stage'), sound });
new Controls({ sound, camera: world.camera });

// the ambient gull call comes from where a gull really is, heard from that side
sound.gullPan = () => {
  const birds = [...world.all(Gull), ...world.all(GullFlock)];
  return world.camera.screenFraction(birds[Math.floor(Math.random() * birds.length)]?.x);
};

world.generate(Number(new URLSearchParams(location.search).get('seed')) || Math.floor(Math.random() * 1e9));
world.start();

window.harbour = { world, sound };   // for the browser console
