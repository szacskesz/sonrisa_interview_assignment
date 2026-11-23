export const usgsSource = {
  url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
  publisher: 'USGS',
  topic: 'Earthquakes',
  pollIntervalSeconds: 60,
};

const catalogUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const eventPage = 'https://earthquake.usgs.gov/earthquakes/eventpage/';
const day = 86_400_000;
const minMagnitude = 4.5;
const pageSize = 200;

function normalizeEvents(features) {
  const events = new Map();
  for (const feature of features) {
    const properties = feature?.properties;
    if (!properties || feature.type !== 'Feature') throw new Error('USGS response contains a malformed feature');
    if (properties.type !== 'earthquake' || !Number.isFinite(properties.mag) || properties.mag < minMagnitude) continue;
    const { mag, place, time, updated, ids } = properties;
    const id = feature.id;
    if (typeof id !== 'string' || !id.trim() || !Number.isSafeInteger(time) || !Number.isSafeInteger(updated)) {
      throw new Error('USGS response contains an earthquake without a valid ID or timestamp');
    }
    if (events.get(id)?.updatedAt >= updated) continue;
    const location = typeof place === 'string' && place.trim() ? place.trim() : 'Location unavailable';
    const aliases = typeof ids === 'string' ? ids.split(',').map((alias) => alias.trim()).filter(Boolean) : [];
    events.set(id, {
      id, aliases, title: `M ${mag} earthquake · ${location}`, publishedAt: time, updatedAt: updated,
      url: eventPage + encodeURIComponent(id),
    });
  }
  return [...events.values()];
}

/** Read the current USGS feed or scan the catalog in bounded occurrence-time windows. */
export function createUsgsSource({ fetchFeed = fetch } = {}) {
  async function read(url, signal) {
    const timeout = AbortSignal.timeout(10_000);
    const response = await fetchFeed(url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: 'error',
      headers: { accept: 'application/geo+json, application/json' },
    });
    if (response.status === 204) return [];
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`USGS request returned HTTP ${response.status}`);
    }
    const collection = await response.json();
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new Error('USGS response is not a GeoJSON FeatureCollection');
    }
    return collection.features;
  }

  return {
    async *scan({ after, through, signal }) {
      if (after === null || through - after < day) {
        yield normalizeEvents(await read(usgsSource.url, signal));
        return;
      }
      for (let start = after; start <= through; start += day) {
        const end = Math.min(start + day - 1, through);
        const url = new URL(catalogUrl);
        url.search = new URLSearchParams({
          format: 'geojson', eventtype: 'earthquake', minmagnitude: String(minMagnitude),
          starttime: new Date(start).toISOString(), endtime: new Date(end).toISOString(),
          orderby: 'time-asc', limit: String(pageSize),
        });
        for (let offset = 1; ; offset += pageSize) {
          url.searchParams.set('offset', String(offset));
          const features = await read(url, signal);
          yield normalizeEvents(features);
          if (features.length < pageSize) break;
        }
      }
    },
  };
}
