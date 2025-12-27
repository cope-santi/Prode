const DEFAULT_TOURNAMENT_ID = "FIFA2026";
const DEFAULT_PROVIDER = "football-data";

function getConfig() {
  return {
    tournamentId: process.env.TOURNAMENT_ID || DEFAULT_TOURNAMENT_ID,
    provider: process.env.PROVIDER || DEFAULT_PROVIDER,
    adminUid: process.env.ADMIN_UID || "",
    footballData: {
      token: process.env.FOOTBALL_DATA_TOKEN || "",
      competitionId: process.env.FOOTBALL_DATA_COMPETITION || "",
      baseUrl: process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4"
    },
    cacheTtlMs: parseInt(process.env.PROVIDER_CACHE_TTL_MS || "20000", 10),
    liveDaysAhead: parseInt(process.env.LIVE_SYNC_DAYS_AHEAD || "3", 10),
    fixtureDaysAhead: parseInt(process.env.FIXTURE_DAYS_AHEAD || "200", 10)
  };
}

function validateProviderConfig(config) {
  if (config.provider === "football-data") {
    if (!config.footballData.token) {
      throw new Error("Missing FOOTBALL_DATA_TOKEN env var.");
    }
    if (!config.footballData.competitionId) {
      throw new Error("Missing FOOTBALL_DATA_COMPETITION env var.");
    }
  }
}

module.exports = {
  getConfig,
  validateProviderConfig
};
