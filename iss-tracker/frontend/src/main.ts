import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

type IssApiResponse = {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
  timestamp: number;
};

type CrewPerson = {
  name: string;
  craft: string;
};

type Coordinates = {
  lat: number;
  lng: number;
  timestamp: number;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <div class="space-shell">
    <div class="space-backdrop"></div>
    <main class="layout">
      <section class="hero-panel">
        <div class="eyebrow">Low Earth Orbit</div>
        <h1>ISS Tracker</h1>
        <p class="subtitle">Live telemetry, orbital trail, and smooth globe-relative motion in a mobile-first mission view.</p>
        <div class="stat-grid">
          <article class="stat-card">
            <span class="label">Latitude</span>
            <strong id="lat-value">--</strong>
          </article>
          <article class="stat-card">
            <span class="label">Longitude</span>
            <strong id="lng-value">--</strong>
          </article>
          <article class="stat-card">
            <span class="label">Altitude</span>
            <strong id="alt-value">--</strong>
          </article>
          <article class="stat-card">
            <span class="label">Velocity</span>
            <strong id="vel-value">--</strong>
          </article>
        </div>
        <div class="meta-row">
          <div>
            <span class="meta-label">Visibility</span>
            <span id="visibility-value">--</span>
          </div>
          <div>
            <span class="meta-label">Last Sync</span>
            <span id="sync-value">Waiting...</span>
          </div>
          <div>
            <span class="meta-label">Status</span>
            <span id="status-value">Booting</span>
          </div>
        </div>
      </section>

      <section class="map-panel">
        <div class="map-frame">
          <div id="map" aria-label="World map with ISS position"></div>
          <div class="map-overlay">
            <div>
              <span class="meta-label">Trail Memory</span>
              <span id="trail-value">0 points</span>
            </div>
            <div>
              <span class="meta-label">Refresh Rate</span>
              <span>5 seconds</span>
            </div>
          </div>
        </div>
      </section>

      <section class="crew-panel">
        <div class="section-header">
          <span class="eyebrow">Crew Feed</span>
          <h2>People in orbit</h2>
        </div>
        <div id="crew-content" class="crew-content">
          <p class="muted">Loading crew data...</p>
        </div>
      </section>
    </main>
  </div>
`;

const latValue = document.querySelector<HTMLElement>('#lat-value')!;
const lngValue = document.querySelector<HTMLElement>('#lng-value')!;
const altValue = document.querySelector<HTMLElement>('#alt-value')!;
const velValue = document.querySelector<HTMLElement>('#vel-value')!;
const visibilityValue = document.querySelector<HTMLElement>('#visibility-value')!;
const syncValue = document.querySelector<HTMLElement>('#sync-value')!;
const statusValue = document.querySelector<HTMLElement>('#status-value')!;
const trailValue = document.querySelector<HTMLElement>('#trail-value')!;
const crewContent = document.querySelector<HTMLElement>('#crew-content')!;

const map = L.map('map', {
  zoomControl: false,
  attributionControl: true,
  worldCopyJump: true
}).setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 5,
  minZoom: 2,
  subdomains: ['a', 'b', 'c'],
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

const issIcon = L.divIcon({
  className: 'iss-marker',
  html: '<div class="iss-core"></div><div class="iss-pulse"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const issMarker = L.marker([0, 0], { icon: issIcon }).addTo(map);
const trail = L.polyline([], {
  color: '#7df9ff',
  weight: 3,
  opacity: 0.85,
  smoothFactor: 1
}).addTo(map);

const orbitPath: Coordinates[] = [];
const maxTrailPoints = 90;
let currentPosition: Coordinates | null = null;
let previousPosition: Coordinates | null = null;

function formatCoordinate(value: number, positive: string, negative: string): string {
  const direction = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(2)}° ${direction}`;
}

function formatKilometers(value: number): string {
  return `${Math.round(value).toLocaleString()} km`;
}

function formatSpeed(value: number): string {
  return `${Math.round(value).toLocaleString()} km/h`;
}

function updateTelemetry(data: IssApiResponse): void {
  latValue.textContent = formatCoordinate(data.latitude, 'N', 'S');
  lngValue.textContent = formatCoordinate(data.longitude, 'E', 'W');
  altValue.textContent = formatKilometers(data.altitude);
  velValue.textContent = formatSpeed(data.velocity);
  visibilityValue.textContent = data.visibility || 'Unknown';
  syncValue.textContent = new Date(data.timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function setStatus(message: string): void {
  statusValue.textContent = message;
}

function normalizeLongitudeDelta(next: number, prev: number): number {
  let delta = next - prev;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

// Smooth marker interpolation keeps motion continuous between API refreshes.
function animateMarker(start: Coordinates, end: Coordinates): void {
  const animationDuration = 4500;
  const startTime = performance.now();

  const frame = (now: number) => {
    const progress = Math.min((now - startTime) / animationDuration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const lat = start.lat + (end.lat - start.lat) * eased;
    const lng = start.lng + normalizeLongitudeDelta(end.lng, start.lng) * eased;
    issMarker.setLatLng([lat, lng]);
    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  };

  requestAnimationFrame(frame);
}

// The trail is kept short and redrawn across the antimeridian to avoid map jumps.
function redrawTrail(): void {
  const segments: L.LatLngExpression[] = [];
  for (let index = 0; index < orbitPath.length; index += 1) {
    const point = orbitPath[index];
    const previous = orbitPath[index - 1];
    if (previous && Math.abs(point.lng - previous.lng) > 180) {
      segments.push([point.lat, point.lng > 0 ? -180 : 180]);
    }
    segments.push([point.lat, point.lng]);
  }

  trail.setLatLngs(segments);
  trailValue.textContent = `${orbitPath.length} points`;
}

function pushTrailPoint(position: Coordinates): void {
  orbitPath.push(position);
  if (orbitPath.length > maxTrailPoints) {
    orbitPath.shift();
  }
  redrawTrail();
}

async function fetchIssPosition(): Promise<void> {
  try {
    setStatus('Tracking');
    const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
    if (!response.ok) {
      throw new Error(`ISS API returned ${response.status}`);
    }

    const data = (await response.json()) as IssApiResponse;
    updateTelemetry(data);

    previousPosition = currentPosition;
    currentPosition = {
      lat: data.latitude,
      lng: data.longitude,
      timestamp: data.timestamp
    };

    pushTrailPoint(currentPosition);

    if (previousPosition) {
      animateMarker(previousPosition, currentPosition);
      map.panTo([currentPosition.lat, currentPosition.lng], { animate: true, duration: 4 });
    } else {
      issMarker.setLatLng([currentPosition.lat, currentPosition.lng]);
      map.panTo([currentPosition.lat, currentPosition.lng], { animate: true, duration: 1.5 });
    }
  } catch (error) {
    console.error(error);
    setStatus('Telemetry unavailable');
    syncValue.textContent = 'Retrying...';
  }
}

async function fetchCrew(): Promise<void> {
  try {
    const response = await fetch('https://api.open-notify.org/astros.json');
    if (!response.ok) {
      throw new Error(`Crew API returned ${response.status}`);
    }

    const payload = (await response.json()) as { people?: CrewPerson[] };
    const crew = (payload.people ?? []).filter((person) => person.craft.toLowerCase().includes('iss'));

    if (!crew.length) {
      crewContent.innerHTML = '<p class="muted">ISS crew data is currently unavailable from this browser source.</p>';
      return;
    }

    crewContent.innerHTML = crew
      .map(
        (person) => `
          <article class="crew-card">
            <span class="crew-role">${person.craft}</span>
            <strong>${person.name}</strong>
          </article>
        `
      )
      .join('');
  } catch (error) {
    console.error(error);
    crewContent.innerHTML = '<p class="muted">Crew data is unavailable from the browser right now.</p>';
  }
}

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.error('Service worker registration failed', error);
  }
}

void Promise.all([fetchIssPosition(), fetchCrew(), registerServiceWorker()]);
window.setInterval(fetchIssPosition, 5000);
