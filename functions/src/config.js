const DEFAULT_TOURNAMENT_ID = "FIFA2026";
const DEFAULT_PROVIDER = "football-data";
const DEFAULT_POST_MATCH_MINUTES = 10;
const DEFAULT_LOOKBACK_DAYS = 2;

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
    theSportsDb: {
      apiKey: process.env.THESPORTSDB_API_KEY || "",
      leagueId: process.env.THESPORTSDB_LEAGUE_ID || "",
      season: process.env.THESPORTSDB_SEASON || "",
      baseUrl: process.env.THESPORTSDB_BASE_URL || "https://www.thesportsdb.com/api/v1/json"
    },
    cacheTtlMs: parseInt(process.env.PROVIDER_CACHE_TTL_MS || "20000", 10),
    liveDaysAhead: parseInt(process.env.LIVE_SYNC_DAYS_AHEAD || "3", 10),
    postMatchSyncMinutes: parseInt(process.env.POST_MATCH_SYNC_MINUTES || `${DEFAULT_POST_MATCH_MINUTES}`, 10),
    lookbackDays: parseInt(process.env.LOOKBACK_DAYS || `${DEFAULT_LOOKBACK_DAYS}`, 10)
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
  if (config.provider === "thesportsdb") {
    if (!config.theSportsDb.apiKey) {
      throw new Error("Missing THESPORTSDB_API_KEY env var.");
    }
    if (!config.theSportsDb.leagueId) {
      throw new Error("Missing THESPORTSDB_LEAGUE_ID env var.");
    }
  }
}

module.exports = {
  getConfig,
  validateProviderConfig
};
