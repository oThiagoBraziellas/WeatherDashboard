/** Open-Meteo URL builders, response parsers and a thin fetch client. No DOM access. */

export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export class ApiError extends Error {
  constructor(message, kind = 'unknown') {
    super(message);
    this.name = 'ApiError';
    this.kind = kind; // 'network' | 'http' | 'data' | 'validation'
  }
}

export function buildGeocodingUrl(query, { count = 6, language = 'en' } = {}) {
  const name = String(query ?? '').trim();
  if (name.length < 2) throw new ApiError('Type at least 2 characters', 'validation');
  const params = new URLSearchParams({ name, count: String(count), language, format: 'json' });
  return `${GEOCODING_URL}?${params}`;
}

export function buildForecastUrl({ latitude, longitude }, { units = 'metric' } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ApiError('Invalid coordinates', 'validation');
  }
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7',
  });
  if (units === 'imperial') {
    params.set('temperature_unit', 'fahrenheit');
    params.set('wind_speed_unit', 'mph');
  }
  return `${FORECAST_URL}?${params}`;
}

/** WMO weather interpretation codes grouped into what a UI needs. */
const WMO = [
  [[0], 'Clear sky', 'clear'],
  [[1], 'Mostly clear', 'clear'],
  [[2], 'Partly cloudy', 'cloudy'],
  [[3], 'Overcast', 'cloudy'],
  [[45, 48], 'Fog', 'fog'],
  [[51, 53, 55], 'Drizzle', 'rain'],
  [[56, 57], 'Freezing drizzle', 'rain'],
  [[61, 63, 65], 'Rain', 'rain'],
  [[66, 67], 'Freezing rain', 'rain'],
  [[71, 73, 75, 77], 'Snow', 'snow'],
  [[80, 81, 82], 'Rain showers', 'rain'],
  [[85, 86], 'Snow showers', 'snow'],
  [[95], 'Thunderstorm', 'storm'],
  [[96, 99], 'Thunderstorm with hail', 'storm'],
];

export function describeWeatherCode(code) {
  for (const [codes, label, group] of WMO) {
    if (codes.includes(code)) return { label, group };
  }
  return { label: 'Unknown', group: 'unknown' };
}

export function parseGeocoding(json) {
  if (!json || typeof json !== 'object') throw new ApiError('Unexpected geocoding response', 'data');
  // Open-Meteo omits "results" entirely when nothing matches.
  const results = Array.isArray(json.results) ? json.results : [];
  return results
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.name)
    .map((r) => ({
      id: r.id ?? `${r.latitude},${r.longitude}`,
      name: r.name,
      region: r.admin1 ?? '',
      country: r.country ?? '',
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? '',
      label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    }));
}

export function parseForecast(json) {
  if (!json || !json.current || !json.daily || !Array.isArray(json.daily.time)) {
    throw new ApiError('Unexpected forecast response', 'data');
  }
  const { current, daily } = json;
  const units = json.current_units ?? {};
  const info = describeWeatherCode(current.weather_code);
  const days = daily.time.map((date, i) => {
    const d = describeWeatherCode(daily.weather_code?.[i]);
    return {
      date,
      label: d.label,
      group: d.group,
      max: daily.temperature_2m_max?.[i] ?? null,
      min: daily.temperature_2m_min?.[i] ?? null,
      precipitationChance: daily.precipitation_probability_max?.[i] ?? null,
    };
  });
  return {
    timezone: json.timezone ?? '',
    current: {
      time: current.time,
      temperature: current.temperature_2m,
      apparent: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      isDay: current.is_day === 1,
      label: info.label,
      group: info.group,
    },
    units: {
      temperature: units.temperature_2m ?? '°C',
      wind: units.wind_speed_10m ?? 'km/h',
      humidity: units.relative_humidity_2m ?? '%',
    },
    days,
  };
}

export function formatTemperature(value, unit = '°C') {
  return Number.isFinite(value) ? `${Math.round(value)}${unit}` : '—';
}

/** "2026-11-05" -> "Thu" computed in UTC so the result does not depend on the viewer's timezone. */
export function weekdayLabel(isoDate, locale = 'en-US', index = 0) {
  if (index === 0) return 'Today';
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

async function getJson(fetchFn, url, signal) {
  let response;
  try {
    response = await fetchFn(url, { signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('Network error. Check your connection and try again.', 'network');
  }
  if (!response.ok) {
    throw new ApiError(`The weather service answered with status ${response.status}`, 'http');
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError('The weather service returned invalid data', 'data');
  }
}

export async function searchCities(query, { fetchFn = globalThis.fetch, signal, language } = {}) {
  const url = buildGeocodingUrl(query, { language });
  return parseGeocoding(await getJson(fetchFn, url, signal));
}

export async function getForecast(place, { fetchFn = globalThis.fetch, signal, units } = {}) {
  const url = buildForecastUrl(place, { units });
  return parseForecast(await getJson(fetchFn, url, signal));
}
