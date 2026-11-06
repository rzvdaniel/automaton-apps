import type { MapViewport, ProjectionCamera } from './mapProjectionDesktop';

type Dimensions = { width: number; height: number };
type IssSampleLike = { latitude: number; longitude: number };

function worldXFromLon(lon: number, worldWidth: number) {
  return ((lon + 180) / 360) * worldWidth;
}

function worldYFromLat(lat: number, worldHeight: number) {
  const clamped = Math.max(-90, Math.min(90, lat));
  return ((90 - clamped) / 180) * worldHeight;
}

export function buildMobileCamera(sample: IssSampleLike | null, canvasWidth: number, canvasHeight: number, world: Dimensions) {
  const zoom = 2.15;
  const aspect = canvasWidth / canvasHeight;
  let sourceWidth = world.width / zoom;
  let sourceHeight = sourceWidth / aspect;
  const maxSourceHeight = world.height / zoom;

  if (sourceHeight > maxSourceHeight) {
    sourceHeight = maxSourceHeight;
    sourceWidth = sourceHeight * aspect;
  }

  const centerWorldX = sample ? worldXFromLon(sample.longitude, world.width) : world.width / 2;
  const desiredY = sample ? worldYFromLat(sample.latitude, world.height) : world.height / 2;
  const centerWorldY = Math.min(world.height - sourceHeight * 0.44, Math.max(sourceHeight * 0.56, desiredY));

  return {
    centerWorldX,
    sourceX: centerWorldX - sourceWidth / 2,
    sourceY: Math.min(world.height - sourceHeight, Math.max(0, centerWorldY - sourceHeight / 2)),
    sourceWidth,
    sourceHeight,
    zoom,
    gridAlpha: 0.06,
    glowScale: 1.2,
    orbitWidth: 4.2,
    groundWidth: 1,
    showLegendLabels: false,
  } satisfies ProjectionCamera;
}

export function getMobileViewport(canvasWidth: number, canvasHeight: number): MapViewport {
  return {
    width: canvasWidth,
    height: canvasHeight,
    offsetX: 0,
    offsetY: 0,
  };
}
