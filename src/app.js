import { searchCities, getForecast, formatTemperature, weekdayLabel } from './api.js';

const $ = (s) => document.querySelector(s);
const els = {
  form: $('#search-form'), input: $('#search-input'), results: $('#results'),
  status: $('#status'), panel: $('#panel'), units: $('#units'), recent: $('#recent'),
};

const STORE_KEY = 'weather.recent.v1';
let units = 'metric';
let current = null;
let forecastController = null;
let searchController = null;

const ICONS = { clear: '☀️', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️', unknown: '❓' };

function setStatus(kind, message, retry) {
  els.status.className = `status ${kind}`;
  els.status.hidden = !message;
  els.status.replaceChildren();
  if (!message) return;
  const text = document.createElement('span');
  text.textContent = message;
  els.status.append(text);
  if (kind === 'loading') {
    const spin = document.createElement('i');
    spin.className = 'spinner';
    spin.setAttribute('aria-hidden', 'true');
    els.status.prepend(spin);
  }
  if (retry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Retry';
    btn.addEventListener('click', retry);
    els.status.append(btn);
  }
}

function recentPlaces() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function remember(place) {
  const list = [place, ...recentPlaces().filter((p) => p.id !== place.id)].slice(0, 5);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  renderRecent();
}
function renderRecent() {
  const list = recentPlaces();
  els.recent.hidden = list.length === 0;
  els.recent.replaceChildren(...list.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.name;
    b.title = p.label;
    b.addEventListener('click', () => loadForecast(p));
    return b;
  }));
}

async function loadForecast(place) {
  current = place;
  els.results.hidden = true;
  forecastController?.abort();
  forecastController = new AbortController();
  els.panel.hidden = true;
  setStatus('loading', `Loading forecast for ${place.name}…`);
  try {
    const forecast = await getForecast(place, { signal: forecastController.signal, units });
    setStatus('', '');
    renderForecast(place, forecast);
    remember(place);
  } catch (err) {
    if (err.name === 'AbortError') return;
    setStatus('error', err.message || 'Something went wrong', () => loadForecast(place));
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderForecast(place, f) {
  const u = f.units;
  const c = f.current;
  const hero = el('section', 'hero');
  hero.append(
    el('h2', '', place.label),
    el('div', 'icon', ICONS[c.group] ?? ICONS.unknown),
    el('div', 'temp', formatTemperature(c.temperature, u.temperature)),
    el('div', 'cond', c.label),
  );
  const stats = el('dl', 'stats');
  for (const [k, v] of [
    ['Feels like', formatTemperature(c.apparent, u.temperature)],
    ['Humidity', `${c.humidity}${u.humidity}`],
    ['Wind', `${Math.round(c.wind)} ${u.wind}`],
  ]) {
    const box = el('div');
    box.append(el('dt', '', k), el('dd', '', v));
    stats.append(box);
  }
  hero.append(stats);

  const days = el('ul', 'days');
  f.days.forEach((d, i) => {
    const li = el('li');
    li.append(
      el('span', 'dow', weekdayLabel(d.date, 'en-US', i)),
      el('span', 'dicon', ICONS[d.group] ?? ICONS.unknown),
      el('span', 'dcond', d.label),
      el('span', 'rain', d.precipitationChance == null ? '' : `${d.precipitationChance}%`),
      el('span', 'range', `${formatTemperature(d.max, '°')} / ${formatTemperature(d.min, '°')}`),
    );
    days.append(li);
  });
  els.panel.replaceChildren(hero, days);
  els.panel.hidden = false;
}

async function runSearch(query) {
  searchController?.abort();
  searchController = new AbortController();
  els.panel.hidden = true;
  setStatus('loading', 'Searching…');
  try {
    const places = await searchCities(query, { signal: searchController.signal });
    if (places.length === 0) {
      els.results.hidden = true;
      setStatus('empty', `No places found for "${query}".`);
      return;
    }
    setStatus('', '');
    els.results.replaceChildren(...places.map((p) => {
      const li = el('li');
      const b = el('button', '', p.label);
      b.type = 'button';
      b.addEventListener('click', () => loadForecast(p));
      li.append(b);
      return li;
    }));
    els.results.hidden = false;
    if (places.length === 1) loadForecast(places[0]);
  } catch (err) {
    if (err.name === 'AbortError') return;
    setStatus('error', err.message || 'Something went wrong', () => runSearch(query));
  }
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch(els.input.value);
});
els.units.addEventListener('click', () => {
  units = units === 'metric' ? 'imperial' : 'metric';
  els.units.textContent = units === 'metric' ? '°C' : '°F';
  els.units.setAttribute('aria-pressed', String(units === 'imperial'));
  if (current) loadForecast(current);
});

renderRecent();
