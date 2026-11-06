import { buildDesktopCamera, getDesktopViewport, type MapViewport, type ProjectionCamera } from './mapProjectionDesktop';
import { buildMobileCamera, getMobileViewport } from './mapProjectionMobile';

type Dimensions = { width: number; height: number };
type IssSampleLike = { latitude: number; longitude: number };

export type { MapViewport, ProjectionCamera as Camera };

export function buildCamera(
  sample: IssSampleLike | null,
  canvasWidth: number,
  canvasHeight: number,
  world: Dimensions,
  mobile: boolean,
) {
  return mobile
    ? buildMobileCamera(sample, canvasWidth, canvasHeight, world)
    : buildDesktopCamera(sample, canvasWidth, canvasHeight, world);
}

export function getMapViewport(canvasWidth: number, canvasHeight: number, camera: ProjectionCamera, mobile: boolean): MapViewport {
  return mobile ? getMobileViewport(canvasWidth, canvasHeight) : getDesktopViewport(canvasWidth, canvasHeight, camera);
}
