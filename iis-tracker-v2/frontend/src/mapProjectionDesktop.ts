export type MapViewport = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export type ProjectionCamera = {
  centerWorldX: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  zoom: number;
  gridAlpha: number;
  glowScale: number;
  orbitWidth: number;
  groundWidth: number;
  showLegendLabels: boolean;
};

type Dimensions = { width: number; height: number };
type IssSampleLike = { latitude: number; longitude: number };

export function buildDesktopCamera(sample: IssSampleLike | null, canvasWidth: number, canvasHeight: number, world: Dimensions) {
  const sourceWidth = world.width;
  const sourceHeight = world.height;

  return {
    centerWorldX: sample ? ((sample.longitude + 180) / 360) * world.width : world.width / 2,
    sourceX: 0,
    sourceY: 0,
    sourceWidth,
    sourceHeight,
    zoom: 1,
    gridAlpha: 0.1,
    glowScale: 1,
    orbitWidth: 3,
    groundWidth: 1.3,
    showLegendLabels: true,
  } satisfies ProjectionCamera;
}

export function getDesktopViewport(canvasWidth: number, canvasHeight: number, camera: ProjectionCamera): MapViewport {
  const mapAspect = camera.sourceWidth / camera.sourceHeight;
  const containerAspect = canvasWidth / canvasHeight;

  if (containerAspect > mapAspect) {
    const height = canvasHeight;
    const width = height * mapAspect;
    return {
      width,
      height,
      offsetX: (canvasWidth - width) / 2,
      offsetY: 0,
    };
  }

  const width = canvasWidth;
  const height = width / mapAspect;
  return {
    width,
    height,
    offsetX: 0,
    offsetY: (canvasHeight - height) / 2,
  };
}
