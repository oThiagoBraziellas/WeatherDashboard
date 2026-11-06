import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildGeocodingUrl, buildForecastUrl, parseGeocoding, parseForecast, describeWeatherCode,
  formatTemperature, weekdayLabel, searchCities, getForecast, ApiError,
} from '../src/api.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('buildGeocodingUrl encodes the query and validates length', () => {
  const url = new URL(buildGeocodingUrl('  São Paulo '));
  assert.equal(url.hostname, 'geocoding-api.open-meteo.com');
  assert.equal(url.searchParams.get('name'), 'São Paulo');
  assert.equal(url.searchParams.get('count'), '6');
  assert.throws(() => buildGeocodingUrl('a'), (e) => e instanceof ApiError && e.kind === 'validation');
  assert.throws(() => buildGeocodingUrl(undefined), ApiError);
});

test('buildForecastUrl includes coordinates, timezone and units', () => {
  const url = new URL(buildForecastUrl({ latitude: 51.5, longitude: -0.12 }));
  assert.equal(url.searchParams.get('latitude'), '51.5');
  assert.equal(url.searchParams.get('longitude'), '-0.12');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('temperature_unit'), null);
  const imperial = new URL(buildForecastUrl({ latitude: 1, longitude: 2 }, { units: 'imperial' }));
  assert.equal(imperial.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(imperial.searchParams.get('wind_speed_unit'), 'mph');
  assert.throws(() => buildForecastUrl({ latitude: NaN, longitude: 1 }), ApiError);
});

test('parseGeocoding maps results and drops entries without coordinates', () => {
  const places = parseGeocoding(fixture('geocoding-london.json'));
  assert.equal(places.length, 2);
  assert.deepEqual(places[0], {
    id: 2643743, name: 'London', region: 'England', country: 'United Kingdom',
    latitude: 51.50853, longitude: -0.12574, timezone: 'Europe/London',
    label: 'London, England, United Kingdom',
  });
  assert.equal(places[1].country, 'Canada');
});

test('parseGeocoding returns [] when the API omits results', () => {
  assert.deepEqual(parseGeocoding(fixture('geocoding-empty.json')), []);
  assert.throws(() => parseGeocoding(null), ApiError);
});

test('parseForecast normalises current conditions and daily rows', () => {
  const f = parseForecast(fixture('forecast-london.json'));
  assert.equal(f.timezone, 'Europe/London');
  assert.equal(f.current.temperature, 9.4);
  assert.equal(f.current.label, 'Rain');
  assert.equal(f.current.group, 'rain');
  assert.equal(f.current.isDay, true);
  assert.equal(f.units.wind, 'km/h');
  assert.equal(f.days.length, 3);
  assert.deepEqual(f.days[2], { date: '2026-11-07', label: 'Clear sky', group: 'clear', max: 12, min: 4.9, precipitationChance: null });
});

test('parseForecast rejects malformed payloads', () => {
  assert.throws(() => parseForecast({}), (e) => e.kind === 'data');
  assert.throws(() => parseForecast({ current: {}, daily: {} }), ApiError);
});

test('describeWeatherCode covers known and unknown codes', () => {
  assert.deepEqual(describeWeatherCode(0), { label: 'Clear sky', group: 'clear' });
  assert.equal(describeWeatherCode(95).group, 'storm');
  assert.equal(describeWeatherCode(73).group, 'snow');
  assert.deepEqual(describeWeatherCode(1234), { label: 'Unknown', group: 'unknown' });
});

test('formatTemperature rounds and handles missing values', () => {
  assert.equal(formatTemperature(9.5), '10°C');
  assert.equal(formatTemperature(null), '—');
  assert.equal(formatTemperature(70.2, '°F'), '70°F');
});

test('weekdayLabel is timezone independent', () => {
  assert.equal(weekdayLabel('2026-11-05', 'en-US', 0), 'Today');
  assert.equal(weekdayLabel('2026-11-06', 'en-US', 1), 'Fri');
  assert.equal(weekdayLabel('garbage', 'en-US', 1), '');
});

test('searchCities uses the injected fetch and parses the fixture', async () => {
  let requested;
  const fetchFn = async (url) => { requested = url; return okResponse(fixture('geocoding-london.json')); };
  const places = await searchCities('London', { fetchFn });
  assert.match(requested, /name=London/);
  assert.equal(places.length, 2);
});

test('getForecast maps HTTP errors, network errors and bad JSON', async () => {
  const place = { latitude: 1, longitude: 2 };
  await assert.rejects(getForecast(place, { fetchFn: async () => ({ ok: false, status: 500 }) }), (e) => e.kind === 'http');
  await assert.rejects(getForecast(place, { fetchFn: async () => { throw new TypeError('fetch failed'); } }), (e) => e.kind === 'network');
  await assert.rejects(
    getForecast(place, { fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) }),
    (e) => e.kind === 'data',
  );
  const f = await getForecast(place, { fetchFn: async () => okResponse(fixture('forecast-london.json')) });
  assert.equal(f.days.length, 3);
});

test('aborted requests propagate AbortError untouched', async () => {
  const fetchFn = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  await assert.rejects(getForecast({ latitude: 1, longitude: 2 }, { fetchFn }), (e) => e.name === 'AbortError');
});
