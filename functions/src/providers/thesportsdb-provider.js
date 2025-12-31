const { setTimeout: delay } = require("node:timers/promises");

const cache = new Map();

class TheSportsDBProvider {
  constructor({ apiKey, baseUrl, leagueId, season, cacheTtlMs }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.leagueId = leagueId;
    this.season = season;
    this.cacheTtlMs = cacheTtlMs;
  }

  async getMatchesByDateRange(dateFrom, dateTo) {
    const past = await this.fetchEndpoint(`eventspastleague.php?id=${this.leagueId}`, "past");
    const next = await this.fetchEndpoint(`eventsnextleague.php?id=${this.leagueId}`, "next");

    const events = [
      ...(Array.isArray(past?.events) ? past.events : []),
      ...(Array.isArray(next?.events) ? next.events : [])
    ];

    return events.filter(event => isWithinRange(event, dateFrom, dateTo));
  }

  async fetchEndpoint(path, cacheKey) {
    const url = `${this.baseUrl}/${this.apiKey}/${path}`;
    const now = Date.now();
    const scopedKey = `${this.leagueId}:${cacheKey}`;
    const cached = cache.get(scopedKey);
    if (cached && now - cached.at < this.cacheTtlMs) {
      return cached.data;
    }

    const response = await fetchWithRetry(url, {});
    if (response.status === 429) {
      const error = new Error("TheSportsDB rate limit reached.");
      error.code = "rate_limit";
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TheSportsDB error ${response.status}: ${body}`);
    }

    const data = await response.json();
    cache.set(scopedKey, { at: now, data });
    return data;
  }
}

function isWithinRange(event, dateFrom, dateTo) {
  if (!event || !event.dateEvent) return true;
  const eventDate = event.dateEvent;
  if (dateFrom && eventDate < dateFrom) return false;
  if (dateTo && eventDate > dateTo) return false;
  return true;
}

async function fetchWithRetry(url, options, attempt = 0) {
  try {
    const response = await fetch(url, options);
    if (response.ok) return response;

    if (response.status === 429) {
      return response;
    }

    const retriable = response.status >= 500;
    if (!retriable || attempt >= 2) return response;

    const backoffMs = 500 * Math.pow(2, attempt);
    await delay(backoffMs);
    return fetchWithRetry(url, options, attempt + 1);
  } catch (error) {
    if (attempt >= 2) throw error;
    const backoffMs = 500 * Math.pow(2, attempt);
    await delay(backoffMs);
    return fetchWithRetry(url, options, attempt + 1);
  }
}

module.exports = {
  TheSportsDBProvider
};
