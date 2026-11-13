// The recorded sounds: where each file is, and which stretches of it are worth playing: [start, seconds].
// The stretches were picked by measuring each recording for its strongest moments. Every file is credited in public/audio/CREDITS.md.
export const SAMPLES = {
  sheep: { file: 'sheep.ogg', clips: [[0.2, 1.6], [5.6, 1.6]] },
  cow: { file: 'cow.ogg' },
  cat: { file: 'cat.wav' },
  whaleCall: { file: 'whale-call.ogg', clips: [[0.4, 4], [12.7, 4], [22.8, 4]] },
  whaleBlow: { file: 'whale-blow.ogg', clips: [[8, 2.2], [57.4, 2.2]] }
};

/** The address of a recording, from the folder these scripts are in (the app's audio folder is public/audio). */
export const sampleAddress = file => new URL(`../../audio/${file}`, import.meta.url).href;
