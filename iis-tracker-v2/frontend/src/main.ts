import './styles.css';
import appIconUrl from './assets/app-icon.png';

type IssSample = {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
  timestamp: number;
};

type AstronautMeta = {
  accent?: string;
  agency?: string;
  bio?: string;
  country?: string;
  daysInSpace?: number;
  role?: string;
};

type AstronautDirectory = Record<string, AstronautMeta>;

type CrewMember = AstronautMeta & {
  initials: string;
  isFallback: boolean;
  name: string;
};

type ReferenceCity = {
  lat: number;
  lon: number;
  name: string;
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
const REFRESH_MS = 5000;
const ORBIT_INCLINATION = 51.64;
const ORBIT_PERIOD_MIN = 92.68;
const MOBILE_BREAKPOINT = 900;
const TRAIL_STORAGE_KEY = 'iss-tracker-v2-trail';
const TRAIL_MAX_AGE_MS = 90 * 60 * 1000;
const DEBUG_TOGGLE_KEY = 'iss-tracker-v2-debug';
const OBSERVED_TRAIL_MIN_POINTS = 4;
const REVERSE_GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const GEOCODE_REFRESH_MS = 5 * 60 * 1000;
const GEOCODE_LABEL_STALE_MOVE = 2.5;
const GEOCODE_FETCH_MOVE = 6;
const GEOCODE_RESPONSE_MAX_DRIFT = 2;
const ISS_FIRST_ORBIT_EPOCH_MS = Date.UTC(1998, 10, 20, 6, 40, 0);
const CURRENT_EXPEDITION = 'Expedition 73';
const CREW_COUNT_LABEL = '7 Astronauts';
const CREW_METADATA_URL = './data/astronauts.json';
const CREW_ROSTER_URL = 'https://api.open-notify.org/astros.json';
const CREW_REFRESH_MS = 10 * 60 * 1000;
const CREW_FETCH_TIMEOUT_MS = 4000;
const CREW_FALLBACK_NAMES = [
  'Anne McClain',
  'Nichole Ayers',
  'Takuya Onishi',
  'Kirill Peskov',
  'Jonny Kim',
  'Oleg Platonov',
  'Kimiya Yui',
];
const REFERENCE_CITIES: ReferenceCity[] = [
  { name: 'London', lat: 51.5, lon: -0.1 },
  { name: 'Cairo', lat: 30.0, lon: 31.2 },
  { name: 'Sydney', lat: -33.9, lon: 151.2 },
  { name: 'New York', lat: 40.7, lon: -74.0 },
];

const mapCanvas = document.querySelector<HTMLCanvasElement>('#mapCanvas')!;
const starCanvas = document.querySelector<HTMLCanvasElement>('#starCanvas')!;
const mapTexture = document.querySelector<HTMLDivElement>('#mapTexture')!;
const mapError = document.querySelector<HTMLDivElement>('#mapError')!;
const debugOverlay = document.querySelector<HTMLDivElement>('#debugOverlay')!;
const brandIcon = document.querySelector<HTMLImageElement>('#brandIcon')!;
const crewTriggerDesktop = document.querySelector<HTMLButtonElement>('#crewTriggerDesktop')!;
const crewTriggerMobile = document.querySelector<HTMLButtonElement>('#crewTriggerMobile')!;
const crewModal = document.querySelector<HTMLDivElement>('#crewModal')!;
const crewBackdrop = document.querySelector<HTMLDivElement>('#crewBackdrop')!;
const crewGrid = document.querySelector<HTMLDivElement>('#crewGrid')!;
const crewModalSubtitle = document.querySelector<HTMLParagraphElement>('#crewModalSubtitle')!;
const crewCloseButton = document.querySelector<HTMLButtonElement>('#crewCloseButton')!;
const installAppButton = document.querySelector<HTMLButtonElement>('#installAppButton')!;

const ids = [
  'liveBadge',
  'liveBadgeText',
  'lastUpdate',
  'latDesktop',
  'lonDesktop',
  'speedDesktop',
  'altDesktop',
  'periodDesktop',
  'visibilityLarge',
  'orbitDesktop',
  'orbitDetailDesktop',
  'nextPassDesktop',
  'passDetailDesktop',
  'passDetailMobile',
  'crewCountDesktop',
  'crewDetailDesktop',
  'distanceTodayDesktop',
  'distanceDetailDesktop',
  'speedMobile',
  'altMobile',
  'latMobile',
  'lonMobile',
  'nextPassMobile',
  'lastUpdateMobile',
  'sunState',
  'crewCountMobile',
  'crewDetailMobile',
  'debugApiTime',
  'debugUtcNow',
  'debugDataAge',
  'debugRawCoords',
  'debugProjectedCoords',
  'debugProjectedPercent',
  'debugMapSize',
  'debugCityChecks',
] as const;

const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)!])) as Record<
  (typeof ids)[number],
  HTMLElement
>;

const locationButtons = [
  document.querySelector<HTMLButtonElement>('#locationButton')!,
  document.querySelector<HTMLButtonElement>('#locationButtonMobile')!,
];
const mapCtx = mapCanvas.getContext('2d')!;
const starCtx = starCanvas.getContext('2d')!;

const dayTexture = new Image();
dayTexture.src = DAY_TEXTURE_URL;
const dayNightMaskCanvas = document.createElement('canvas');
const dayNightMaskCtx = dayNightMaskCanvas.getContext('2d')!;

let currentSample: IssSample | null = null;
let previousSample: IssSample | null = null;
let renderSample: IssSample | null = null;
let lastFetchAt = 0;
let trail: IssSample[] = [];
let stars: Array<{ x: number; y: number; r: number; a: number; drift: number }> = [];
let lastGeocodeAt = 0;
let lastGeocodeCoords: { lat: number; lon: number } | null = null;
let lastResolvedCoords: { lat: number; lon: number } | null = null;
let geocodeRequestId = 0;
let astronautDirectory: AstronautDirectory = {};
let crewMembers: CrewMember[] = [];
let crewLoaded = false;
let crewRefreshTimer: number | null = null;
let telemetryLoaded = false;
let lastIssTimestamp = 0;
let deferredInstallPrompt:
  | (Event & {
      prompt: () => Promise<void>;
      userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    })
  | null = null;

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

function formatDebugUtc(timestampMs: number) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(timestampMs));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getOrbitNumber(timestamp: number) {
  const orbitLengthMs = ORBIT_PERIOD_MIN * 60 * 1000;
  return Math.max(1, Math.floor((timestamp * 1000 - ISS_FIRST_ORBIT_EPOCH_MS) / orbitLengthMs) + 1);
}

function getDistanceTodayKm(sample: IssSample) {
  const now = new Date(sample.timestamp * 1000);
  const startOfUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const secondsToday = Math.max(0, sample.timestamp - startOfUtcDay);
  return Math.round((sample.velocity / 3600) * secondsToday);
}

function setLiveState(state: 'live' | 'reconnecting') {
  const isLive = state === 'live';
  el.liveBadgeText.textContent = isLive ? 'Live' : 'Reconnecting';
  el.liveBadge.classList.toggle('offline', !isLive);
}

function setTelemetryReady() {
  if (telemetryLoaded) return;
  telemetryLoaded = true;
  document.body.classList.remove('app-loading');
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCrewKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'IS';
}

function getCrewCountLabel(count: number) {
  return `${count} Astronaut${count === 1 ? '' : 's'}`;
}

function renderCrewPanel() {
  const count = crewMembers.length || CREW_FALLBACK_NAMES.length;
  const countLabel = getCrewCountLabel(count);
  const mobileCountLabel = `${countLabel} onboard`;
  el.crewCountDesktop.textContent = countLabel;
  el.crewCountMobile.textContent = mobileCountLabel;
  el.crewDetailDesktop.textContent = CURRENT_EXPEDITION;
  el.crewDetailMobile.textContent = CURRENT_EXPEDITION;
  crewModalSubtitle.textContent = crewLoaded
    ? `${CURRENT_EXPEDITION} • ${countLabel} onboard`
    : `Loading roster • ${CURRENT_EXPEDITION}`;

  if (!crewLoaded) {
    crewGrid.innerHTML = Array.from({ length: 4 }, () => `
      <article class="crew-member-card crew-member-skeleton" aria-hidden="true">
        <div class="crew-member-top">
          <span class="crew-avatar"></span>
          <div class="crew-lines">
            <span class="crew-line crew-line-title"></span>
            <span class="crew-line crew-line-subtitle"></span>
          </div>
        </div>
        <span class="crew-line crew-line-meta"></span>
        <span class="crew-line crew-line-bio"></span>
        <span class="crew-line crew-line-bio crew-line-bio-short"></span>
      </article>
    `).join('');
    return;
  }

  if (!crewMembers.length) {
    crewGrid.innerHTML = `
      <article class="crew-empty">
        <strong>Crew roster syncing</strong>
        <p>Profile cards will populate as soon as the live station roster responds.</p>
      </article>
    `;
    return;
  }

  crewGrid.innerHTML = crewMembers
    .map((member) => {
      const accent = member.accent ?? '#18e7ff';
      const subtitle = [member.role, member.agency].filter(Boolean).join(' • ') || 'ISS crew';
      const meta = [
        member.country ?? 'Country pending',
        typeof member.daysInSpace === 'number' ? `${formatNumber(member.daysInSpace)} days in space` : '',
      ]
        .filter(Boolean)
        .join(' • ');
      return `
        <article class="crew-member-card">
          <div class="crew-member-top">
            <span class="crew-avatar" style="--crew-accent: ${escapeHtml(accent)}">${escapeHtml(member.initials)}</span>
            <div>
              <strong>${escapeHtml(member.name)}</strong>
              <p>${escapeHtml(subtitle)}</p>
            </div>
          </div>
          <p class="crew-meta">${escapeHtml(meta || 'ISS crew profile')}</p>
          <p class="crew-bio">${escapeHtml(member.bio ?? 'Live roster confirmed. Enriched biography will appear as local metadata grows.')}</p>
          ${member.isFallback ? '<span class="crew-chip">Partial profile</span>' : ''}
        </article>
      `;
    })
    .join('');
}

function openCrewModal() {
  crewModal.hidden = false;
  document.body.classList.add('crew-modal-open');
}

function closeCrewModal() {
  crewModal.hidden = true;
  document.body.classList.remove('crew-modal-open');
}

async function loadAstronautDirectory() {
  const response = await fetch(CREW_METADATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Crew metadata returned ${response.status}`);
  astronautDirectory = (await response.json()) as AstronautDirectory;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function buildCrewMembers(names: string[]) {
  return names.map((name) => {
    const metadata = astronautDirectory[normalizeCrewKey(name)] ?? {};
    return {
      ...metadata,
      initials: getInitials(name),
      isFallback: Object.keys(metadata).length === 0,
      name,
    } satisfies CrewMember;
  });
}

async function refreshCrewRoster() {
  try {
    if (!Object.keys(astronautDirectory).length) {
      await loadAstronautDirectory();
    }
    const payload = await fetchJsonWithTimeout<{ people?: Array<{ craft?: string; name?: string }> }>(
      CREW_ROSTER_URL,
      CREW_FETCH_TIMEOUT_MS,
    );
    const names = (payload.people ?? [])
      .filter((person) => person.craft === 'ISS' && typeof person.name === 'string')
      .map((person) => person.name as string);
    crewMembers = buildCrewMembers(names.length ? names : CREW_FALLBACK_NAMES);
    crewLoaded = true;
  } catch {
    if (!Object.keys(astronautDirectory).length) {
      try {
        await loadAstronautDirectory();
      } catch {
        astronautDirectory = {};
      }
    }
    crewMembers = buildCrewMembers(CREW_FALLBACK_NAMES);
    crewLoaded = true;
  }
  renderCrewPanel();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pruneTrail(samples: IssSample[]) {
  const cutoff = Math.floor((Date.now() - TRAIL_MAX_AGE_MS) / 1000);
  return samples.filter((sample) => sample.timestamp >= cutoff).slice(-110);
}

function loadStoredTrail() {
  try {
    const raw = window.localStorage.getItem(TRAIL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneTrail(
      parsed.filter(
        (sample): sample is IssSample =>
          typeof sample?.latitude === 'number' &&
          typeof sample?.longitude === 'number' &&
          typeof sample?.altitude === 'number' &&
          typeof sample?.velocity === 'number' &&
          typeof sample?.timestamp === 'number' &&
          typeof sample?.visibility === 'string',
      ),
    );
  } catch {
    return [];
  }
}

function saveTrail(samples: IssSample[]) {
  try {
    window.localStorage.setItem(TRAIL_STORAGE_KEY, JSON.stringify(pruneTrail(samples)));
  } catch {
    // Ignore storage failures; the live trail still works for this session.
  }
}

function worldXFromLon(lon: number, worldWidth: number) {
  return ((lon + 180) / 360) * worldWidth;
}

function worldYFromLat(lat: number, worldHeight: number) {
  const clamped = Math.max(-90, Math.min(90, lat));
  return ((90 - clamped) / 180) * worldHeight;
}

function lonFromWorldX(worldX: number, worldWidth: number) {
  return (worldX / worldWidth) * 360 - 180;
}

function latFromWorldY(worldY: number, worldHeight: number) {
  return 90 - (worldY / worldHeight) * 180;
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

function getDebugEnabled() {
  return window.localStorage.getItem(DEBUG_TOGGLE_KEY) === '1';
}

function getOceanFallback(lat: number, lon: number) {
  if (lat < -45 && lon > -130 && lon < -70) return 'Southern Pacific Ocean';
  if (lat < -35 && lon >= -70 && lon <= 20) return 'South Atlantic Ocean';
  if (lat < -35 && lon > 20 && lon < 150) return 'Southern Indian Ocean';
  if (lat > 45 && lon > -80 && lon < 20) return 'North Atlantic Ocean';
  if (lat > 35 && lon >= 120) return 'North Pacific Ocean';
  if (lat > 25 && lon > 30 && lon < 150) return 'Northern Asia';
  if (lat > 20 && lon > -20 && lon < 55) return 'North Africa';
  if (lat > -10 && lat < 20 && lon > -30 && lon < 55) return 'Equatorial Africa';
  if (lat > -20 && lat < 15 && lon > 110 && lon < 180) return 'Western Pacific Ocean';
  if (lat > -20 && lat < 20 && lon > -110 && lon < -10) return 'Eastern Pacific Ocean';
  if (lat > -25 && lat < 15 && lon >= -80 && lon <= -35) return 'Northern South America';
  if (lat < -15 && lat > -50 && lon >= -80 && lon <= -35) return 'Southern South America';
  if (lat > 35 && lon >= -130 && lon <= -60) return 'North America';
  if (lat < -10 && lon > 110 && lon < 180) return 'Eastern Australia';
  return 'Open Ocean';
}

function describeCurrentOver(data: Record<string, unknown>, lat: number, lon: number) {
  const principalSubdivision =
    typeof data.principalSubdivision === 'string' ? data.principalSubdivision : '';
  const countryName = typeof data.countryName === 'string' ? data.countryName : '';
  const continent = typeof data.continent === 'string' ? data.continent : '';
  if (countryName) {
    const broadParts = [principalSubdivision.trim(), countryName.trim()].filter(Boolean);
    if (broadParts.length >= 2) {
      return titleCase(`${broadParts[0]}, ${broadParts[1]}`);
    }
    return titleCase(countryName);
  }
  if (continent) {
    return titleCase(continent);
  }
  return getOceanFallback(lat, lon);
}

function shouldRefreshGeocode(sample: IssSample) {
  if (!lastGeocodeCoords) return true;
  const moved = Math.abs(sample.latitude - lastGeocodeCoords.lat) + Math.abs(sample.longitude - lastGeocodeCoords.lon);
  return moved > GEOCODE_FETCH_MOVE || Date.now() - lastGeocodeAt > GEOCODE_REFRESH_MS;
}

function shouldRefreshCurrentOverLabel(sample: IssSample) {
  if (!lastResolvedCoords) return true;
  const moved =
    Math.abs(sample.latitude - lastResolvedCoords.lat) + Math.abs(sample.longitude - lastResolvedCoords.lon);
  return moved > GEOCODE_LABEL_STALE_MOVE;
}

function setCurrentOverLabel(label: string) {
  el.nextPassDesktop.textContent = label;
  el.nextPassMobile.textContent = label;
}

async function updateCurrentOver(sample: IssSample) {
  const fallback = getOceanFallback(sample.latitude, sample.longitude);
  if (shouldRefreshCurrentOverLabel(sample)) {
    setCurrentOverLabel(fallback);
  }

  if (!shouldRefreshGeocode(sample)) return;

  const requestId = ++geocodeRequestId;
  lastGeocodeAt = Date.now();
  lastGeocodeCoords = { lat: sample.latitude, lon: sample.longitude };

  try {
    const url = `${REVERSE_GEOCODE_URL}?latitude=${sample.latitude}&longitude=${sample.longitude}&localityLanguage=en`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Geocode returned ${response.status}`);
    const data = (await response.json()) as Record<string, unknown>;
    if (requestId !== geocodeRequestId) return;
    if (currentSample) {
      const drift =
        Math.abs(currentSample.latitude - sample.latitude) + Math.abs(currentSample.longitude - sample.longitude);
      if (drift > GEOCODE_RESPONSE_MAX_DRIFT) return;
    }
    const label = describeCurrentOver(data, sample.latitude, sample.longitude);
    lastResolvedCoords = { lat: sample.latitude, lon: sample.longitude };
    setCurrentOverLabel(label);
  } catch {
    if (requestId !== geocodeRequestId) return;
    lastResolvedCoords = { lat: sample.latitude, lon: sample.longitude };
    setCurrentOverLabel(fallback);
  }
}

function setDebugEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(DEBUG_TOGGLE_KEY, enabled ? '1' : '0');
  } catch {
    return;
  }
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

function updateInstallButton() {
  const shouldShow = Boolean(deferredInstallPrompt) && isMobileViewport();
  installAppButton.hidden = !shouldShow;
}

function syncAppIcons() {
  brandIcon.src = appIconUrl;
  const iconSelectors = ['link[rel="icon"]', 'link[rel="apple-touch-icon"]'];
  for (const selector of iconSelectors) {
    const link = document.querySelector<HTMLLinkElement>(selector);
    if (!link) continue;
    link.href = appIconUrl;
  }
}

function getSubsolarPoint(timestampMs: number) {
  const date = new Date(timestampMs);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (timestampMs - startOfYear) / 86_400_000;
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + date.getUTCMilliseconds() / 3_600_000;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (utcHours - 12) / 24);
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const subsolarLongitude = ((720 - utcHours * 60 - equationOfTime) / 4 + 540) % 360 - 180;
  return {
    latitude: (declination * 180) / Math.PI,
    longitude: subsolarLongitude,
  };
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
  const texture = dayTexture;
  return {
    width: texture.naturalWidth || 4096,
    height: texture.naturalHeight || 2048,
  };
}

function updateTextureLayer(camera: Camera) {
  const viewportWidth = mapCanvas.clientWidth;
  const viewportHeight = mapCanvas.clientHeight;
  const world = getWorldDimensions();
  const scaledWidth = (world.width / camera.sourceWidth) * viewportWidth;
  const scaledHeight = (world.height / camera.sourceHeight) * viewportHeight;
  const offsetX = -(camera.sourceX / camera.sourceWidth) * viewportWidth;
  const offsetY = -(camera.sourceY / camera.sourceHeight) * viewportHeight;

  mapTexture.style.backgroundImage = `url("${DAY_TEXTURE_URL}")`;
  mapTexture.style.backgroundSize = `${scaledWidth}px ${scaledHeight}px`;
  mapTexture.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
}

function buildCamera(sample: IssSample | null, canvasWidth: number, canvasHeight: number): Camera {
  const world = getWorldDimensions();
  const mobile = isMobileViewport();
  const zoom = mobile ? 2.15 : 1;
  const aspect = canvasWidth / canvasHeight;
  const worldAspect = world.width / world.height;
  let sourceWidth = world.width / zoom;
  let sourceHeight = sourceWidth / aspect;
  const maxSourceHeight = world.height / zoom;

  if (!mobile && aspect >= worldAspect) {
    sourceHeight = world.height;
    sourceWidth = sourceHeight * aspect;
  } else if (sourceHeight > maxSourceHeight) {
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

function drawDayNightOverlay(camera: Camera, timestampMs: number) {
  const width = mapCanvas.clientWidth;
  const height = mapCanvas.clientHeight;
  const maskWidth = Math.max(160, Math.round(width / 2));
  const maskHeight = Math.max(90, Math.round(height / 2));
  const world = getWorldDimensions();
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

  mapCtx.save();
  mapCtx.imageSmoothingEnabled = true;
  mapCtx.drawImage(dayNightMaskCanvas, 0, 0, width, height);
  const glow = mapCtx.createRadialGradient(width * 0.5, height * 0.2, 0, width * 0.5, height * 0.5, width * 0.72);
  glow.addColorStop(0, 'rgba(255, 214, 112, 0.05)');
  glow.addColorStop(1, 'rgba(255, 214, 112, 0)');
  mapCtx.fillStyle = glow;
  mapCtx.fillRect(0, 0, width, height);
  mapCtx.restore();
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

function drawWrappedPath(points: RenderPoint[], style: 'solid' | 'dashed', camera: Camera) {
  mapCtx.save();
  mapCtx.lineWidth = style === 'solid' ? camera.orbitWidth : camera.groundWidth;
  mapCtx.strokeStyle = style === 'solid' ? '#18e7ff' : 'rgba(180, 247, 255, 0.88)';
  mapCtx.shadowColor = style === 'solid' ? '#18e7ff' : 'transparent';
  mapCtx.shadowBlur = style === 'solid' ? 16 * camera.glowScale : 0;
  if (style === 'dashed') mapCtx.setLineDash(isMobileViewport() ? [8, 7] : [10, 8]);

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

function drawObservedTrail(points: RenderPoint[], camera: Camera) {
  if (points.length < 2) return;

  mapCtx.save();
  mapCtx.lineWidth = isMobileViewport() ? 3.2 : 2.8;
  mapCtx.lineCap = 'round';
  mapCtx.lineJoin = 'round';

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    if (Math.abs(point.x - prev.x) > mapCanvas.clientWidth * 0.45) {
      continue;
    }

    const age = i / (points.length - 1);
    const alpha = 0.18 + age * 0.78;
    mapCtx.strokeStyle = `rgba(24, 231, 255, ${alpha})`;
    mapCtx.shadowColor = age > 0.75 ? 'rgba(24, 231, 255, 0.3)' : 'transparent';
    mapCtx.shadowBlur = age > 0.75 ? 8 : 0;
    mapCtx.beginPath();
    mapCtx.moveTo(prev.x, prev.y);
    mapCtx.lineTo(point.x, point.y);
    mapCtx.stroke();
  }

  mapCtx.restore();
}

function buildTrailPath(samples: IssSample[], camera: Camera) {
  return samples.map((sample) => projectPoint(sample.latitude, sample.longitude, camera));
}

function orbitLatitude(lon: number, phase: number) {
  return ORBIT_INCLINATION * Math.sin(((lon + phase) * Math.PI) / 180);
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

function buildEstimatedOrbitPath(sample: IssSample, previous: IssSample | null, camera: Camera) {
  const phase = getOrbitPhase(sample, previous);
  return Array.from({ length: 721 }, (_, index) => {
    const lon = -180 + index * 0.5;
    return projectPoint(orbitLatitude(lon, phase), lon, camera);
  });
}

function drawOrbit(sample: IssSample | null, camera: Camera) {
  if (!sample) return;

  const observedPoints = buildTrailPath(trail, camera);
  const hasObservedTrail = observedPoints.length >= OBSERVED_TRAIL_MIN_POINTS;
  const estimatedOpacity = hasObservedTrail ? 0.62 : 0.94;
  const estimatedWidth = hasObservedTrail ? Math.max(1.5, camera.groundWidth + 0.35) : Math.max(2.2, camera.groundWidth + 1);

  mapCtx.save();
  mapCtx.globalAlpha = estimatedOpacity;
  const previousWidth = camera.groundWidth;
  drawWrappedPath(buildEstimatedOrbitPath(sample, previousSample, camera), 'dashed', {
    ...camera,
    groundWidth: estimatedWidth,
  });
  mapCtx.restore();

  if (observedPoints.length > 1) {
    drawObservedTrail(observedPoints, camera);
  } else {
    const markerPoint = projectPoint(sample.latitude, sample.longitude, camera);
    mapCtx.save();
    mapCtx.fillStyle = 'rgba(24, 231, 255, 0.42)';
    mapCtx.beginPath();
    mapCtx.arc(markerPoint.x, markerPoint.y, isMobileViewport() ? 5 : 4, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.restore();
  }
}

function drawIssMarker(sample: IssSample, time: number, camera: Camera) {
  const point = projectPoint(sample.latitude, sample.longitude, camera);
  const pulse = 0.58 + Math.sin(time * 0.0034) * 0.14;
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

function updateDebugOverlay(sample: IssSample, camera: Camera) {
  const point = projectPoint(sample.latitude, sample.longitude, camera);
  const timestampMs = lastIssTimestamp ? lastIssTimestamp * 1000 : sample.timestamp * 1000;
  const ageSeconds = Math.max(0, Math.round(Date.now() / 1000 - (lastIssTimestamp || sample.timestamp)));
  const cityChecks = REFERENCE_CITIES.map((city) => {
    const cityPoint = projectPoint(city.lat, city.lon, camera);
    return `${city.name}:${Math.round(cityPoint.x)},${Math.round(cityPoint.y)}`;
  }).join(' • ');
  el.debugRawCoords.textContent = `${sample.latitude.toFixed(2)}°, ${sample.longitude.toFixed(2)}°`;
  el.debugProjectedCoords.textContent = `${Math.round(point.x)}px, ${Math.round(point.y)}px`;
  el.debugApiTime.textContent = `${formatDebugUtc(timestampMs)} UTC`;
  el.debugUtcNow.textContent = `${formatDebugUtc(Date.now())} UTC`;
  el.debugDataAge.textContent = ageSeconds > 10 ? `${ageSeconds}s stale` : `${ageSeconds}s`;
  el.debugProjectedPercent.textContent = `${((point.x / mapCanvas.clientWidth) * 100).toFixed(1)}%, ${((point.y / mapCanvas.clientHeight) * 100).toFixed(1)}%`;
  el.debugMapSize.textContent = `${mapCanvas.clientWidth}x${mapCanvas.clientHeight}`;
  el.debugCityChecks.textContent = cityChecks;
  debugOverlay.hidden = !getDebugEnabled();
  debugOverlay.classList.toggle('warning', ageSeconds > 10);
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
  drawDayNightOverlay(camera, Date.now());
  if (getDebugEnabled()) {
    drawGrid(camera);
  }

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
  if (renderSample) {
    drawIssMarker(renderSample, time, activeCamera);
    updateDebugOverlay(renderSample, activeCamera);
  }
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
  const orbitNumber = getOrbitNumber(sample.timestamp);
  const distanceToday = formatNumber(getDistanceTodayKm(sample));

  el.latDesktop.textContent = latitude;
  el.lonDesktop.textContent = longitude;
  el.speedDesktop.textContent = speed;
  el.altDesktop.textContent = altitude;
  el.periodDesktop.textContent = ORBIT_PERIOD_MIN.toFixed(2);
  el.visibilityLarge.textContent = visibility;
  el.orbitDesktop.textContent = `#${formatNumber(orbitNumber)}`;
  el.orbitDetailDesktop.textContent = 'Around Earth';
  el.distanceTodayDesktop.textContent = `${distanceToday} km`;
  el.distanceDetailDesktop.textContent = 'Since 00:00 UTC';
  el.speedMobile.textContent = speed;
  el.altMobile.textContent = altitude;
  el.latMobile.textContent = latitude;
  el.lonMobile.textContent = longitude;
  el.lastUpdate.textContent = updateTime;
  el.lastUpdateMobile.textContent = updateTime;
  el.sunState.textContent = visibility === 'Daylight' ? 'Station is sunlit' : 'Station is in orbital night';
  setLiveState('live');
  setTelemetryReady();
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
    lastIssTimestamp = data.timestamp;
    lastFetchAt = Date.now();
    trail = pruneTrail([...trail, currentSample]);
    saveTrail(trail);
    updateTelemetry(currentSample);
    void updateCurrentOver(currentSample);
    mapError.hidden = true;
  } catch (error) {
    console.error(error);
    mapError.hidden = false;
    setLiveState('reconnecting');
    setTelemetryReady();
  }
}

function setLocationButtonsState(label: string, disabled: boolean) {
  for (const button of locationButtons) {
    button.textContent = label;
    button.disabled = disabled;
    button.classList.toggle('enabled', disabled && label.includes('Location On'));
  }
}

function setLocationDetail(message: string) {
  el.passDetailDesktop.textContent = message;
  el.passDetailMobile.textContent = message;
}

function setLocationRetryState(message: string) {
  setLocationDetail(message);
  setLocationButtonsState('⚠ Retry Location', false);
}

async function getGeolocationPermissionState() {
  try {
    const permissions = (navigator as Navigator & {
      permissions?: { query: (descriptor: { name: 'geolocation' }) => Promise<{ state: string }> };
    }).permissions;
    if (!permissions) return 'unknown';
    return (await permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'unknown';
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
  setLocationDetail(`Local pass around ${time}`);
}

async function requestLocationPrediction() {
  if (!navigator.geolocation) {
    setLocationRetryState('This browser does not expose geolocation here.');
    return;
  }

  const permissionState = await getGeolocationPermissionState();
  if (permissionState === 'denied') {
    setLocationRetryState('Location permission is blocked. Enable it in browser site settings, then retry.');
    return;
  }

  setLocationButtonsState('📍 Locating', true);
  setLocationDetail('Requesting browser location access...');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      estimateNextPass(position.coords.latitude, position.coords.longitude);
      setLocationButtonsState('✓ Location On', true);
    },
    async (error) => {
      const permissionState = await getGeolocationPermissionState();

      if (error.code === error.PERMISSION_DENIED || permissionState === 'denied') {
        setLocationRetryState('Location permission is blocked. Enable it in browser site settings, then retry.');
        return;
      }
      if (error.code === error.TIMEOUT) {
        setLocationRetryState('Location request timed out. Retry in a stronger signal area.');
        return;
      }
      if (error.code === error.POSITION_UNAVAILABLE) {
        setLocationRetryState('Location is unavailable right now. Retry in a moment.');
        return;
      }
      setLocationRetryState('Location access did not complete. Retry to request passes again.');
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  );
}

for (const button of locationButtons) {
  button.addEventListener('click', requestLocationPrediction);
}

for (const button of [crewTriggerDesktop, crewTriggerMobile]) {
  button.addEventListener('click', openCrewModal);
}

crewBackdrop.addEventListener('click', closeCrewModal);
crewCloseButton.addEventListener('click', closeCrewModal);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event as typeof deferredInstallPrompt;
  updateInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButton();
});

window.addEventListener('resize', resizeCanvases);
window.addEventListener('resize', updateInstallButton);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !crewModal.hidden) {
    closeCrewModal();
    return;
  }
  if (!event.shiftKey || event.key.toLowerCase() !== 'd') return;
  const next = !getDebugEnabled();
  setDebugEnabled(next);
  debugOverlay.hidden = !next;
});

installAppButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } catch {
    // Ignore install prompt failures; the browser will preserve the state.
  }
  deferredInstallPrompt = null;
  updateInstallButton();
});

resizeCanvases();
syncAppIcons();
trail = loadStoredTrail();
debugOverlay.hidden = !getDebugEnabled();
renderCrewPanel();
updateInstallButton();
void refreshCrewRoster();
crewRefreshTimer = window.setInterval(() => {
  void refreshCrewRoster();
}, CREW_REFRESH_MS);
fetchIssPosition();
setInterval(fetchIssPosition, REFRESH_MS);
render();
