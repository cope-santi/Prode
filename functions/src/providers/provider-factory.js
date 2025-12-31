const { FootballDataProvider } = require("./football-data-provider");
const { TheSportsDBProvider } = require("./thesportsdb-provider");

function createProvider(config) {
  if (config.provider === "football-data") {
    return new FootballDataProvider({
      token: config.footballData.token,
      baseUrl: config.footballData.baseUrl,
      competitionId: config.footballData.competitionId,
      cacheTtlMs: config.cacheTtlMs
    });
  }

  if (config.provider === "thesportsdb") {
    return new TheSportsDBProvider({
      apiKey: config.theSportsDb.apiKey,
      baseUrl: config.theSportsDb.baseUrl,
      leagueId: config.theSportsDb.leagueId,
      season: config.theSportsDb.season,
      cacheTtlMs: config.cacheTtlMs
    });
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}

module.exports = {
  createProvider
};
