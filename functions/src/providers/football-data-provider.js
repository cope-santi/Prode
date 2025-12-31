const { setTimeout: delay } = require("node:timers/promises");

let cache = {
  key: null,
  at: 0,
  data: null
};

class FootballDataProvider {
  constructor({ token, baseUrl, competitionId, cacheTtlMs }) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.competitionId = competitionId;
    this.cacheTtlMs = cacheTtlMs;
  }

  async getMatchesByDateRange(dateFrom, dateTo) {
    const url = new URL(`${this.baseUrl}/competitions/${this.competitionId}/matches`);
    if (dateFrom) url.searchParams.set("dateFrom", dateFrom);
    if (dateTo) url.searchParams.set("dateTo", dateTo);

    const cacheKey = url.toString();
    const now = Date.now();
    if (cache.key === cacheKey && cache.data && now - cache.at < this.cacheTtlMs) {
      return cache.data;
    }

    const response = await fetchWithRetry(cacheKey, {
      headers: {
        "X-Auth-Token": this.token
      }
    });

    if (response.status === 429) {
      const error = new Error("FootballData rate limit reached.");
      error.code = "rate_limit";
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FootballData error ${response.status}: ${body}`);
    }

    const payload = await response.json();
    const matches = Array.isArray(payload.matches) ? payload.matches : [];
    cache = { key: cacheKey, at: now, data: matches };
    return matches;
  }
}

async function fetchWithRetry(url, options, attempt = 0) {
  const response = await fetch(url, options);
  if (response.ok) return response;

  const retriable = response.status === 429 || (response.status >= 500 && response.status < 600);
  if (!retriable || attempt >= 2) return response;

  const backoffMs = 500 * Math.pow(2, attempt);
  await delay(backoffMs);
  return fetchWithRetry(url, options, attempt + 1);
}

module.exports = {
  FootballDataProvider
};
