import { getMapViewport, type Camera } from './mapProjection';

export type WorldDimensions = {
  width: number;
  height: number;
};

export type RenderPoint = {
  x: number;
  y: number;
  lat: number;
  lon: number;
};

export type DebugElements = {
  debugApiTime: HTMLElement;
  debugUtcNow: HTMLElement;
  debugDataAge: HTMLElement;
  debugProjectionMode: HTMLElement;
  debugRawCoords: HTMLElement;
  debugProjectedCoords: HTMLElement;
  debugProjectedPercent: HTMLElement;
  debugMapSize: HTMLElement;
  debugCityChecks: HTMLElement;
};

type City = {
  name: string;
  lat: number;
  lon: number;
};

function lonFromWorldX(worldX: number, worldWidth: number) {
  return (worldX / worldWidth) * 360 - 180;
}

function latFromWorldY(worldY: number, worldHeight: number) {
  return 90 - (worldY / worldHeight) * 180;
}

function worldXFromLon(lon: number, worldWidth: number) {
  return ((lon + 180) / 360) * worldWidth;
}

function worldYFromLat(lat: number, worldHeight: number) {
  const clamped = Math.max(-90, Math.min(90, lat));
  return ((90 - clamped) / 180) * worldHeight;
}

function shortestWorldDelta(value: number, center: number, worldWidth: number) {
  let delta = value - center;
  if (delta > worldWidth / 2) delta -= worldWidth;
  if (delta < -worldWidth / 2) delta += worldWidth;
  return delta;
}

export function projectPoint(
  lat: number,
  lon: number,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  world: WorldDimensions,
  mobile: boolean,
) {
  const viewport = getMapViewport(canvasWidth, canvasHeight, camera, mobile);
  const baseX = worldXFromLon(lon, world.width);
  const baseY = worldYFromLat(lat, world.height);
  const adjustedX = camera.centerWorldX + shortestWorldDelta(baseX, camera.centerWorldX, world.width);
  return {
    x: viewport.offsetX + ((adjustedX - camera.sourceX) / camera.sourceWidth) * viewport.width,
    y: viewport.offsetY + ((baseY - camera.sourceY) / camera.sourceHeight) * viewport.height,
    lat,
    lon,
  } satisfies RenderPoint;
}

export function updateTextureLayer(
  mapTexture: HTMLDivElement,
  camera: Camera,
  dayTextureUrl: string,
  canvasWidth: number,
  canvasHeight: number,
  world: WorldDimensions,
  mobile: boolean,
) {
  const viewport = getMapViewport(canvasWidth, canvasHeight, camera, mobile);
  const scaledWidth = (world.width / camera.sourceWidth) * viewport.width;
  const scaledHeight = (world.height / camera.sourceHeight) * viewport.height;
  const offsetX = viewport.offsetX - (camera.sourceX / camera.sourceWidth) * viewport.width;
  const offsetY = viewport.offsetY - (camera.sourceY / camera.sourceHeight) * viewport.height;

  mapTexture.style.backgroundImage = `url("${dayTextureUrl}")`;
  mapTexture.style.backgroundSize = `${scaledWidth}px ${scaledHeight}px`;
  mapTexture.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
}

export function drawTextureBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(6, 21, 40, 0.12)');
  gradient.addColorStop(0.5, 'rgba(3, 16, 29, 0.08)');
  gradient.addColorStop(1, 'rgba(2, 8, 20, 0.18)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const shade = ctx.createRadialGradient(width * 0.48, height * 0.46, 0, width * 0.48, height * 0.46, width * 0.72);
  shade.addColorStop(0, 'rgba(2, 13, 28, 0)');
  shade.addColorStop(0.65, 'rgba(2, 13, 28, 0.18)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

export function drawDayNightOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  timestampMs: number,
  canvasWidth: number,
  canvasHeight: number,
  world: WorldDimensions,
  mobile: boolean,
  getSubsolarPoint: (timestampMs: number) => { latitude: number; longitude: number },
  dayNightMaskCanvas: HTMLCanvasElement,
  dayNightMaskCtx: CanvasRenderingContext2D,
) {
  const viewport = getMapViewport(canvasWidth, canvasHeight, camera, mobile);
  const maskWidth = Math.max(160, Math.round(viewport.width / 2));
  const maskHeight = Math.max(90, Math.round(viewport.height / 2));
  const subsolar = getSubsolarPoint(timestampMs);
  const sunLatRad = (subsolar.latitude * Math.PI) / 180;
  const sunLonRad = (subsolar.longitude * Math.PI) / 180;
  dayNightMaskCanvas.width = maskWidth;
  dayNightMaskCanvas.height = maskHeight;

  const imageData = dayNightMaskCtx.createImageData(maskWidth, maskHeight);
  const pixels = imageData.data;

  for (let row = 0; row < maskHeight; row += 1) {
    const worldY = camera.sourceY + ((row + 0.5) / maskHeight) * camera.sourceHeight;
    const lat = latFromWorldY(worldY, world.height);
    const latRad = (lat * Math.PI) / 180;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    for (let col = 0; col < maskWidth; col += 1) {
      const worldX = camera.sourceX + ((col + 0.5) / maskWidth) * camera.sourceWidth;
      const wrappedWorldX = ((worldX % world.width) + world.width) % world.width;
      const lon = lonFromWorldX(wrappedWorldX, world.width);
      const lonRad = (lon * Math.PI) / 180;
      const solarCos =
        sinLat * Math.sin(sunLatRad) + cosLat * Math.cos(sunLatRad) * Math.cos(lonRad - sunLonRad);
      const normalized = Math.max(0, Math.min(1, (0.14 - solarCos) / 0.28));
      const alpha = Math.round((0.1 + normalized * 0.42) * 255);
      const index = (row * maskWidth + col) * 4;
      pixels[index] = 3;
      pixels[index + 1] = 9;
      pixels[index + 2] = 20;
      pixels[index + 3] = normalized <= 0 ? 0 : alpha;
    }
  }

  dayNightMaskCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(dayNightMaskCanvas, viewport.offsetX, viewport.offsetY, viewport.width, viewport.height);
  const glow = ctx.createRadialGradient(
    viewport.offsetX + viewport.width * 0.5,
    viewport.offsetY + viewport.height * 0.2,
    0,
    viewport.offsetX + viewport.width * 0.5,
    viewport.offsetY + viewport.height * 0.5,
    viewport.width * 0.72,
  );
  glow.addColorStop(0, 'rgba(255, 214, 112, 0.05)');
  glow.addColorStop(1, 'rgba(255, 214, 112, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(viewport.offsetX, viewport.offsetY, viewport.width, viewport.height);
  ctx.restore();
}

export function drawDebugGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  world: WorldDimensions,
  mobile: boolean,
  currentLongitude: number,
) {
  const viewport = getMapViewport(canvasWidth, canvasHeight, camera, mobile);
  ctx.save();

  const field = ctx.createLinearGradient(viewport.offsetX, viewport.offsetY, viewport.offsetX + viewport.width, viewport.offsetY + viewport.height);
  field.addColorStop(0, 'rgba(255, 94, 87, 0.14)');
  field.addColorStop(0.5, 'rgba(24, 231, 255, 0.08)');
  field.addColorStop(1, 'rgba(123, 255, 168, 0.14)');
  ctx.fillStyle = field;
  ctx.fillRect(viewport.offsetX, viewport.offsetY, viewport.width, viewport.height);

  ctx.strokeStyle = `rgba(37, 208, 255, ${camera.gridAlpha})`;
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const p = projectPoint(0, lon, camera, canvasWidth, canvasHeight, world, mobile);
    ctx.beginPath();
    ctx.moveTo(p.x, viewport.offsetY);
    ctx.lineTo(p.x, viewport.offsetY + viewport.height);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 15) {
    const p = projectPoint(lat, 0, camera, canvasWidth, canvasHeight, world, mobile);
    ctx.beginPath();
    ctx.moveTo(viewport.offsetX, p.y);
    ctx.lineTo(viewport.offsetX + viewport.width, p.y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(viewport.offsetX + 0.5, viewport.offsetY + 0.5, viewport.width - 1, viewport.height - 1);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(viewport.offsetX + viewport.width / 2, viewport.offsetY);
  ctx.lineTo(viewport.offsetX + viewport.width / 2, viewport.offsetY + viewport.height);
  ctx.moveTo(viewport.offsetX, viewport.offsetY + viewport.height / 2);
  ctx.lineTo(viewport.offsetX + viewport.width, viewport.offsetY + viewport.height / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.stroke();

  if (camera.showLegendLabels) {
    ctx.fillStyle = 'rgba(190, 221, 255, 0.78)';
    ctx.font = '11px Inter, system-ui, sans-serif';
    for (let lat = -60; lat <= 60; lat += 30) {
      const p = projectPoint(lat, currentLongitude, camera, canvasWidth, canvasHeight, world, mobile);
      ctx.fillText(`${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`, viewport.offsetX + 18, p.y - 5);
    }
    for (let lon = -180; lon <= 180; lon += 60) {
      const p = projectPoint(0, lon, camera, canvasWidth, canvasHeight, world, mobile);
      if (p.x > viewport.offsetX - 30 && p.x < viewport.offsetX + viewport.width + 30) {
        ctx.fillText(`${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`, p.x + 4, viewport.offsetY + viewport.height - 18);
      }
    }
  }
  ctx.restore();
}

export function drawAmbientOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, mobile: boolean) {
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, 'rgba(0, 8, 24, 0.15)');
  overlay.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  overlay.addColorStop(1, mobile ? 'rgba(0, 6, 18, 0.34)' : 'rgba(0, 6, 18, 0.24)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);
}

export function updateDebugPanel(
  debugOverlay: HTMLDivElement,
  elements: DebugElements,
  sample: { latitude: number; longitude: number; timestamp: number },
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  world: WorldDimensions,
  mobile: boolean,
  lastIssTimestamp: number,
  formatDebugUtc: (timestampMs: number) => string,
  cities: City[],
  debugEnabled: boolean,
) {
  const viewport = getMapViewport(canvasWidth, canvasHeight, camera, mobile);
  const point = projectPoint(sample.latitude, sample.longitude, camera, canvasWidth, canvasHeight, world, mobile);
  const timestampMs = lastIssTimestamp ? lastIssTimestamp * 1000 : sample.timestamp * 1000;
  const ageSeconds = Math.max(0, Math.round(Date.now() / 1000 - (lastIssTimestamp || sample.timestamp)));
  const cityChecks = cities
    .map((city) => {
      const cityPoint = projectPoint(city.lat, city.lon, camera, canvasWidth, canvasHeight, world, mobile);
      return `${city.name}:${Math.round(cityPoint.x)},${Math.round(cityPoint.y)}`;
    })
    .join(' • ');

  elements.debugRawCoords.textContent = `${sample.latitude.toFixed(2)}°, ${sample.longitude.toFixed(2)}°`;
  elements.debugProjectedCoords.textContent = `${Math.round(point.x)}px, ${Math.round(point.y)}px`;
  elements.debugApiTime.textContent = `${formatDebugUtc(timestampMs)} UTC`;
  elements.debugUtcNow.textContent = `${formatDebugUtc(Date.now())} UTC`;
  elements.debugDataAge.textContent = ageSeconds > 10 ? `${ageSeconds}s stale` : `${ageSeconds}s`;
  elements.debugProjectionMode.textContent = mobile ? 'mobile-track' : 'desktop-fit';
  elements.debugProjectedPercent.textContent = `${(((point.x - viewport.offsetX) / viewport.width) * 100).toFixed(1)}%, ${(((point.y - viewport.offsetY) / viewport.height) * 100).toFixed(1)}%`;
  elements.debugMapSize.textContent = `${Math.round(viewport.width)}x${Math.round(viewport.height)} @ ${Math.round(viewport.offsetX)},${Math.round(viewport.offsetY)}`;
  elements.debugCityChecks.textContent = cityChecks;
  debugOverlay.hidden = !debugEnabled;
  debugOverlay.classList.toggle('warning', ageSeconds > 10);
}
