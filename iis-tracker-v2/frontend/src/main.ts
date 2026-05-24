import './styles.css';

type IssSample = {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
  timestamp: number;
};

type RenderPoint = { x: number; y: number; lat: number; lon: number };

type Camera = {
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

const API_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
const DAY_TEXTURE_URL = './maps/day-map.png';
const NIGHT_TEXTURE_URL = './maps/night-map.png';
const REFRESH_MS = 5000;
const ORBIT_INCLINATION = 51.64;
const ORBIT_PERIOD_MIN = 92.68;
const MOBILE_BREAKPOINT = 900;

const mapCanvas = document.querySelector<HTMLCanvasElement>('#mapCanvas')!;
const starCanvas = document.querySelector<HTMLCanvasElement>('#starCanvas')!;
const mapTexture = document.querySelector<HTMLDivElement>('#mapTexture')!;
const trailChart = document.querySelector<HTMLCanvasElement>('#trailChart')!;
const mapError = document.querySelector<HTMLDivElement>('#mapError')!;

const ids = [
  'lastUpdate',
  'latDesktop',
  'lonDesktop',
  'speedDesktop',
  'altDesktop',
  'periodDesktop',
  'visibilityDesktop',
  'visibilityLarge',
  'trackingStatus',
  'nextPassDesktop',
  'passDetailDesktop',
  'passDetailMobile',
  'crewCount',
  'speedMobile',
  'altMobile',
  'latMobile',
  'lonMobile',
  'visibilityMobile',
  'nextPassMobile',
  'lastUpdateMobile',
  'sunState',
  'trackingStatusMobile',
] as const;

const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)!])) as Record<
  (typeof ids)[number],
  HTMLElement
>;

const locationButton = document.querySelector<HTMLButtonElement>('#locationButton')!;
const statusOrb = document.querySelector<HTMLSpanElement>('#statusOrb')!;
const mapCtx = mapCanvas.getContext('2d')!;
const starCtx = starCanvas.getContext('2d')!;
const chartCtx = trailChart.getContext('2d')!;

const dayTexture = new Image();
dayTexture.src = DAY_TEXTURE_URL;
const nightTexture = new Image();
nightTexture.src = NIGHT_TEXTURE_URL;

let currentSample: IssSample | null = null;
let previousSample: IssSample | null = null;
let renderSample: IssSample | null = null;
let lastFetchAt = 0;
let trail: IssSample[] = [];
let stars: Array<{ x: number; y: number; r: number; a: number; drift: number }> = [];

function formatCoord(value: number, positive: string, negative: string) {
  const suffix = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(2)}° ${suffix}`;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function worldXFromLon(lon: number, worldWidth: number) {
  return ((lon + 180) / 360) * worldWidth;
}

function worldYFromLat(lat: number, worldHeight: number) {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return worldHeight / 2 - (worldHeight / (2 * Math.PI)) * mercator;
}

function interpolateAngle(start: number, end: number, amount: number) {
  let delta = end - start;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return start + delta * amount;
}

function wrapValue(value: number, min: number, max: number) {
  const range = max - min;
  if (range === 0) return min;
  let wrapped = (value - min) % range;
  if (wrapped < 0) wrapped += range;
  return wrapped + min;
}

function shortestWorldDelta(value: number, center: number, worldWidth: number) {
  let delta = value - center;
  if (delta > worldWidth / 2) delta -= worldWidth;
  if (delta < -worldWidth / 2) delta += worldWidth;
  return delta;
}

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function getTimeBlend() {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  if (hour < 5 || hour >= 19) return 0;
  if (hour >= 7 && hour < 17) return 1;
  if (hour >= 5 && hour < 7) return (hour - 5) / 2;
  return 1 - (hour - 17) / 2;
}

function resizeCanvases() {
  const ratio = window.devicePixelRatio || 1;
  for (const canvas of [mapCanvas, starCanvas]) {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext('2d')!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  stars = Array.from({ length: Math.round(window.innerWidth / 7) }, () => ({
    x: Math.random() * starCanvas.clientWidth,
    y: Math.random() * starCanvas.clientHeight,
    r: Math.random() * 1.5 + 0.25,
    a: Math.random() * 0.8 + 0.15,
    drift: Math.random() * 0.16 + 0.03,
  }));
}

function drawStars(time: number) {
  const width = starCanvas.clientWidth;
  const height = starCanvas.clientHeight;
  starCtx.clearRect(0, 0, width, height);
  starCtx.fillStyle = '#020712';
  starCtx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const x = (star.x + time * star.drift * 0.012) % width;
    const pulse = 0.45 + Math.sin(time * 0.001 + star.x) * 0.25;
    starCtx.beginPath();
    starCtx.fillStyle = `rgba(182, 232, 255, ${star.a * pulse})`;
    starCtx.arc(x, star.y, star.r, 0, Math.PI * 2);
    starCtx.fill();
  }
}

function getWorldDimensions() {
  const texture = nightTexture.naturalWidth > 0 ? nightTexture : dayTexture;
  return {
    width: texture.naturalWidth || 4096,
    height: texture.naturalHeight || 2048,
  };
}

function updateTextureLayer(camera: Camera) {
  const viewportWidth = mapCanvas.clientWidth;
  const viewportHeight = mapCanvas.clientHeight;
  const world = getWorldDimensions();
  const dayBlend = getTimeBlend();
  const activeTexture = dayBlend >= 0.5 ? DAY_TEXTURE_URL : NIGHT_TEXTURE_URL;
  const scaledWidth = (world.width / camera.sourceWidth) * viewportWidth;
  const scaledHeight = (world.height / camera.sourceHeight) * viewportHeight;
  const offsetX = -(camera.sourceX / camera.sourceWidth) * viewportWidth;
  const offsetY = -(camera.sourceY / camera.sourceHeight) * viewportHeight;

  mapTexture.style.backgroundImage = `url("${activeTexture}")`;
  mapTexture.style.backgroundSize = `${scaledWidth}px ${scaledHeight}px`;
  mapTexture.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
}

function buildCamera(sample: IssSample | null, canvasWidth: number, canvasHeight: number): Camera {
  const world = getWorldDimensions();
  const mobile = isMobileViewport();
  const zoom = mobile ? 2.15 : 1;
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
  const centerWorldY = mobile
    ? Math.min(world.height - sourceHeight * 0.44, Math.max(sourceHeight * 0.56, desiredY))
    : world.height / 2;

  return {
    centerWorldX,
    sourceX: centerWorldX - sourceWidth / 2,
    sourceY: Math.min(world.height - sourceHeight, Math.max(0, centerWorldY - sourceHeight / 2)),
    sourceWidth,
    sourceHeight,
    zoom,
    gridAlpha: mobile ? 0.06 : 0.1,
    glowScale: mobile ? 1.2 : 1,
    orbitWidth: mobile ? 4.2 : 3,
    groundWidth: mobile ? 1 : 1.3,
    showLegendLabels: !mobile,
  };
}

function drawTextureMap(camera: Camera) {
  const width = mapCanvas.clientWidth;
  const height = mapCanvas.clientHeight;
  const gradient = mapCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(6, 21, 40, 0.12)');
  gradient.addColorStop(0.5, 'rgba(3, 16, 29, 0.08)');
  gradient.addColorStop(1, 'rgba(2, 8, 20, 0.18)');
  mapCtx.fillStyle = gradient;
  mapCtx.fillRect(0, 0, width, height);

  const shade = mapCtx.createRadialGradient(width * 0.48, height * 0.46, 0, width * 0.48, height * 0.46, width * 0.72);
  shade.addColorStop(0, 'rgba(2, 13, 28, 0)');
  shade.addColorStop(0.65, 'rgba(2, 13, 28, 0.18)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  mapCtx.fillStyle = shade;
  mapCtx.fillRect(0, 0, width, height);
}

function projectPoint(lat: number, lon: number, camera: Camera): RenderPoint {
  const world = getWorldDimensions();
  const baseX = worldXFromLon(lon, world.width);
  const baseY = worldYFromLat(lat, world.height);
  const adjustedX = camera.centerWorldX + shortestWorldDelta(baseX, camera.centerWorldX, world.width);
  return {
    x: ((adjustedX - camera.sourceX) / camera.sourceWidth) * mapCanvas.clientWidth,
    y: ((baseY - camera.sourceY) / camera.sourceHeight) * mapCanvas.clientHeight,
    lat,
    lon,
  };
}

function drawGrid(camera: Camera) {
  const width = mapCanvas.clientWidth;
  const height = mapCanvas.clientHeight;
  mapCtx.save();
  mapCtx.strokeStyle = `rgba(37, 208, 255, ${camera.gridAlpha})`;
  mapCtx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const p = projectPoint(0, lon, camera);
    mapCtx.beginPath();
    mapCtx.moveTo(p.x, 0);
    mapCtx.lineTo(p.x, height);
    mapCtx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 15) {
    const p = projectPoint(lat, 0, camera);
    mapCtx.beginPath();
    mapCtx.moveTo(0, p.y);
    mapCtx.lineTo(width, p.y);
    mapCtx.stroke();
  }

  if (camera.showLegendLabels) {
    mapCtx.fillStyle = 'rgba(190, 221, 255, 0.72)';
    mapCtx.font = '11px Inter, system-ui, sans-serif';
    for (let lat = -60; lat <= 60; lat += 30) {
      const p = projectPoint(lat, renderSample?.longitude ?? 0, camera);
      mapCtx.fillText(`${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`, 18, p.y - 5);
    }
    for (let lon = -180; lon <= 180; lon += 60) {
      const p = projectPoint(0, lon, camera);
      if (p.x > -30 && p.x < width + 30) {
        mapCtx.fillText(`${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`, p.x + 4, height - 18);
      }
    }
  }
  mapCtx.restore();
}

function orbitLatitude(lon: number, phase: number) {
  return ORBIT_INCLINATION * Math.sin(((lon + phase) * Math.PI) / 180);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getOrbitPhase(sample: IssSample, previous: IssSample | null) {
  const normalizedLat = clamp(sample.latitude / ORBIT_INCLINATION, -1, 1);
  const baseAngle = (Math.asin(normalizedLat) * 180) / Math.PI;
  const phaseCandidates = [baseAngle - sample.longitude, 180 - baseAngle - sample.longitude].map((phase) =>
    wrapValue(phase, -180, 180),
  );

  if (!previous) {
    return phaseCandidates[0];
  }

  let bestPhase = phaseCandidates[0];
  let bestError = Number.POSITIVE_INFINITY;

  for (const candidate of phaseCandidates) {
    const predictedLatitude = orbitLatitude(previous.longitude, candidate);
    const error = Math.abs(predictedLatitude - previous.latitude);
    if (error < bestError) {
      bestError = error;
      bestPhase = candidate;
    }
  }

  return bestPhase;
}

function drawWrappedPath(points: RenderPoint[], style: 'solid' | 'dashed', camera: Camera) {
  mapCtx.save();
  mapCtx.lineWidth = style === 'solid' ? camera.orbitWidth : camera.groundWidth;
  mapCtx.strokeStyle = style === 'solid' ? '#18e7ff' : 'rgba(190, 221, 255, 0.42)';
  mapCtx.shadowColor = style === 'solid' ? '#18e7ff' : 'transparent';
  mapCtx.shadowBlur = style === 'solid' ? 16 * camera.glowScale : 0;
  if (style === 'dashed') mapCtx.setLineDash(isMobileViewport() ? [4, 9] : [6, 9]);

  let started = false;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const last = points[i - 1];
    if (!started || (last && Math.abs(point.x - last.x) > mapCanvas.clientWidth * 0.45)) {
      if (started) mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(point.x, point.y);
      started = true;
    } else {
      mapCtx.lineTo(point.x, point.y);
    }
  }
  mapCtx.stroke();
  mapCtx.restore();
}

function drawOrbit(sample: IssSample | null, camera: Camera) {
  const phase = sample ? getOrbitPhase(sample, previousSample) : 24;
  const points = Array.from({ length: 721 }, (_, index) => {
    const lon = -180 + index * 0.5;
    const lat = orbitLatitude(lon, phase);
    return projectPoint(lat, lon, camera);
  });
  const ground = Array.from({ length: 721 }, (_, index) => {
    const lon = -180 + index * 0.5;
    const lat = orbitLatitude(lon, phase) * 0.12;
    return projectPoint(lat, lon, camera);
  });

  drawWrappedPath(ground, 'dashed', camera);
  drawWrappedPath(points, 'solid', camera);
}

function drawIssMarker(sample: IssSample, time: number, camera: Camera) {
  const point = projectPoint(sample.latitude, sample.longitude, camera);
  const pulse = 0.55 + Math.sin(time * 0.005) * 0.25;
  const radius = (isMobileViewport() ? 34 : 28) + pulse * 10;

  mapCtx.save();
  mapCtx.translate(point.x, point.y);
  mapCtx.fillStyle = `rgba(24, 231, 255, ${0.12 + pulse * 0.08})`;
  mapCtx.shadowColor = '#18e7ff';
  mapCtx.shadowBlur = 34;
  mapCtx.beginPath();
  mapCtx.arc(0, 0, radius, 0, Math.PI * 2);
  mapCtx.fill();

  mapCtx.strokeStyle = 'rgba(24, 231, 255, 0.6)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  mapCtx.arc(0, 0, radius * 0.62, 0, Math.PI * 2);
  mapCtx.stroke();

  mapCtx.rotate(-0.18);
  mapCtx.shadowBlur = 8;
  mapCtx.strokeStyle = '#f6fbff';
  mapCtx.lineWidth = isMobileViewport() ? 5 : 4;
  mapCtx.beginPath();
  mapCtx.moveTo(-18, 0);
  mapCtx.lineTo(18, 0);
  mapCtx.moveTo(-7, -12);
  mapCtx.lineTo(-7, 12);
  mapCtx.moveTo(7, -12);
  mapCtx.lineTo(7, 12);
  mapCtx.stroke();
  mapCtx.lineWidth = 2;
  mapCtx.strokeStyle = '#18e7ff';
  mapCtx.strokeRect(-24, -6, 9, 12);
  mapCtx.strokeRect(15, -6, 9, 12);
  mapCtx.restore();
}

function drawAmbientOverlay(camera: Camera) {
  const width = mapCanvas.clientWidth;
  const height = mapCanvas.clientHeight;
  const overlay = mapCtx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, 'rgba(0, 8, 24, 0.15)');
  overlay.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  overlay.addColorStop(1, isMobileViewport() ? 'rgba(0, 6, 18, 0.34)' : 'rgba(0, 6, 18, 0.24)');
  mapCtx.fillStyle = overlay;
  mapCtx.fillRect(0, 0, width, height);

  if (isMobileViewport()) {
    mapCtx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    mapCtx.fillRect(width * 0.74, 0, width * 0.26, height);
  }
}

function render(time = 0) {
  requestAnimationFrame(render);
  drawStars(time);

  const width = mapCanvas.clientWidth;
  const height = mapCanvas.clientHeight;
  const camera = buildCamera(renderSample ?? currentSample, width, height);
  updateTextureLayer(camera);
  mapCtx.clearRect(0, 0, width, height);
  drawTextureMap(camera);
  drawGrid(camera);

  if (previousSample && currentSample) {
    const amount = Math.min(1, (Date.now() - lastFetchAt) / REFRESH_MS);
    renderSample = {
      ...currentSample,
      latitude: previousSample.latitude + (currentSample.latitude - previousSample.latitude) * amount,
      longitude: interpolateAngle(previousSample.longitude, currentSample.longitude, amount),
      altitude: previousSample.altitude + (currentSample.altitude - previousSample.altitude) * amount,
      velocity: previousSample.velocity + (currentSample.velocity - previousSample.velocity) * amount,
    };
  } else {
    renderSample = currentSample;
  }

  const activeCamera = buildCamera(renderSample, width, height);
  drawOrbit(renderSample, activeCamera);
  if (renderSample) drawIssMarker(renderSample, time, activeCamera);
  drawAmbientOverlay(activeCamera);
}

function updateTelemetry(sample: IssSample) {
  const latitude = formatCoord(sample.latitude, 'N', 'S');
  const longitude = formatCoord(sample.longitude, 'E', 'W');
  const speed = formatNumber(sample.velocity);
  const altitude = formatNumber(sample.altitude);
  const visibility =
    sample.visibility === 'daylight' ? 'Daylight' : sample.visibility === 'eclipsed' ? 'Eclipsed' : 'Unknown';
  const updateTime = formatTime(sample.timestamp);

  el.latDesktop.textContent = latitude;
  el.lonDesktop.textContent = longitude;
  el.speedDesktop.textContent = speed;
  el.altDesktop.textContent = altitude;
  el.periodDesktop.textContent = ORBIT_PERIOD_MIN.toFixed(2);
  el.visibilityDesktop.textContent = visibility;
  el.visibilityLarge.textContent = visibility;
  el.trackingStatus.textContent = 'Tracking';
  el.trackingStatusMobile.textContent = 'Tracking';
  el.speedMobile.textContent = speed;
  el.altMobile.textContent = altitude;
  el.latMobile.textContent = latitude;
  el.lonMobile.textContent = longitude;
  el.visibilityMobile.textContent = visibility;
  el.lastUpdate.textContent = updateTime;
  el.lastUpdateMobile.textContent = updateTime;
  el.sunState.textContent = visibility === 'Daylight' ? 'Station is sunlit' : 'Station is in orbital night';
  statusOrb.classList.toggle('eclipsed', visibility !== 'Daylight');
}

function drawTrailChart() {
  const width = trailChart.width;
  const height = trailChart.height;
  chartCtx.clearRect(0, 0, width, height);
  chartCtx.strokeStyle = 'rgba(64, 223, 255, 0.11)';
  chartCtx.lineWidth = 1;
  for (let x = 24; x < width; x += 44) {
    chartCtx.beginPath();
    chartCtx.moveTo(x, 18);
    chartCtx.lineTo(x, height - 18);
    chartCtx.stroke();
  }
  for (let y = 26; y < height; y += 38) {
    chartCtx.beginPath();
    chartCtx.moveTo(18, y);
    chartCtx.lineTo(width - 18, y);
    chartCtx.stroke();
  }

  if (trail.length < 2) return;
  chartCtx.save();
  chartCtx.strokeStyle = '#18e7ff';
  chartCtx.shadowColor = '#18e7ff';
  chartCtx.shadowBlur = 12;
  chartCtx.lineWidth = 4;
  chartCtx.beginPath();
  trail.forEach((sample, index) => {
    const x = 20 + (index / Math.max(1, trail.length - 1)) * (width - 40);
    const y = 20 + ((90 - (sample.latitude + 90)) / 180) * (height - 40);
    if (index === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();
  chartCtx.restore();
}

async function fetchIssPosition() {
  try {
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`ISS API returned ${response.status}`);
    const data = (await response.json()) as IssSample;
    previousSample = currentSample ?? data;
    currentSample = {
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude,
      velocity: data.velocity,
      visibility: data.visibility,
      timestamp: data.timestamp,
    };
    lastFetchAt = Date.now();
    trail = [...trail, currentSample].slice(-110);
    updateTelemetry(currentSample);
    drawTrailChart();
    mapError.hidden = true;
  } catch (error) {
    console.error(error);
    mapError.hidden = false;
    el.trackingStatus.textContent = 'Reconnecting';
    el.trackingStatusMobile.textContent = 'Reconnecting';
  }
}

function estimateNextPass(latitude: number, longitude: number) {
  if (!currentSample) return;
  const minutesAway = Math.max(
    8,
    Math.round((Math.abs(latitude - currentSample.latitude) + Math.abs(longitude - currentSample.longitude) / 2) % 92),
  );
  const passDate = new Date(Date.now() + minutesAway * 60_000);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(passDate);
  el.nextPassDesktop.textContent = `Today ${time}`;
  el.passDetailDesktop.textContent = 'Approximate local overflight window';
  el.nextPassMobile.textContent = `Today ${time}`;
  el.passDetailMobile.textContent = 'Approximate local overflight window';
}

locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    el.passDetailDesktop.textContent = 'Location is unavailable in this browser.';
    el.passDetailMobile.textContent = 'Location is unavailable in this browser.';
    return;
  }
  locationButton.disabled = true;
  locationButton.textContent = 'Locating';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      estimateNextPass(position.coords.latitude, position.coords.longitude);
      locationButton.textContent = 'Location active';
    },
    () => {
      el.passDetailDesktop.textContent = 'Location permission was not granted.';
      el.passDetailMobile.textContent = 'Location permission was not granted.';
      locationButton.disabled = false;
      locationButton.textContent = 'Use location';
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  );
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

window.addEventListener('resize', resizeCanvases);

resizeCanvases();
fetchIssPosition();
setInterval(fetchIssPosition, REFRESH_MS);
render();
