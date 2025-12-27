const { FootballDataProvider } = require("./football-data-provider");

function createProvider(config) {
  if (config.provider === "football-data") {
    return new FootballDataProvider({
      token: config.footballData.token,
      baseUrl: config.footballData.baseUrl,
      competitionId: config.footballData.competitionId,
      cacheTtlMs: config.cacheTtlMs
    });
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}

module.exports = {
  createProvider
};
