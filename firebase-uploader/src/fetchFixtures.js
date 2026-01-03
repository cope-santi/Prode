const fs = require('node:fs');
const path = require('node:path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || '123';
const THESPORTSDB_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}`;
if (!THESPORTSDB_API_KEY || THESPORTSDB_API_KEY === '123') {
  console.warn('[fetchFixtures] THESPORTSDB_API_KEY is not set. Update the env var or edit the file.');
}

// Rate limiting: 30 requests/minute for free tier
const RATE_LIMIT_MS = 2100;
let lastRequestTime = 0;

const DEFAULT_TOURNAMENT_CONFIG = {
  tournamentId: 'FIFA2026',
  displayName: 'FIFA World Cup 2026',
  theSportsDbLeagueId: ''
};

function loadTournamentConfig() {
  const envConfig = {
    tournamentId: process.env.TOURNAMENT_ID,
    displayName: process.env.TOURNAMENT_DISPLAY_NAME,
    theSportsDbLeagueId: process.env.THESPORTSDB_LEAGUE_ID
  };

  const configPath = process.env.TOURNAMENT_CONFIG_PATH
    ? path.resolve(process.env.TOURNAMENT_CONFIG_PATH)
    : path.resolve(__dirname, '../tournament-config.json');

  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.warn(`[fetchFixtures] Could not parse ${configPath}: ${error.message}`);
    }
  }

  const overrides = Object.fromEntries(
    Object.entries(envConfig).filter(([, value]) => value)
  );

  return { ...DEFAULT_TOURNAMENT_CONFIG, ...fileConfig, ...overrides };
}

const TOURNAMENT_CONFIG = loadTournamentConfig();

async function enforceRateLimit() {
  const now = Date.now();
  const delta = now - lastRequestTime;
  if (delta < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - delta));
  }
  lastRequestTime = Date.now();
}

async function searchTeam(teamName) {
  if (!teamName || teamName.trim().length === 0) {
    console.error('Team name cannot be empty');
    return null;
  }

  try {
    await enforceRateLimit();
    const url = `${THESPORTSDB_BASE_URL}/searchteams.php?t=${encodeURIComponent(teamName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[searchTeam] API returned status ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (!data.teams || data.teams.length === 0) {
      console.warn(`[searchTeam] No team found for "${teamName}"`);
      return null;
    }
    const team = data.teams[0];
    return {
      idTeam: team.idTeam,
      strTeam: team.strTeam
    };
  } catch (error) {
    console.error('[searchTeam] Error:', error.message);
    return null;
  }
}

function normalizeLeague(strLeague) {
  if (!strLeague) return null;
  const leagueMap = {
    'English Premier League': 'Premier League',
    'Spanish La Liga': 'La Liga',
    'Italian Serie A': 'Serie A',
    'German Bundesliga': 'Bundesliga',
    'French Ligue 1': 'Ligue 1',
    'UEFA Champions League': 'Champions League',
    'UEFA Europa League': 'Europa League',
    'CONMEBOL Copa America': 'Copa America',
    'FIFA World Cup': 'World Cup',
    'UEFA Euro': 'Eurocopa',
    'International Friendly': 'International Friendlies'
  };
  if (leagueMap[strLeague]) return leagueMap[strLeague];
  for (const [key, value] of Object.entries(leagueMap)) {
    if (strLeague.includes(key) || key.includes(strLeague)) {
      return value;
    }
  }
  return strLeague;
}

function formatDateToISO(dateEvent, timeEvent) {
  const rawDate = String(dateEvent || '').trim();
  const rawTime = String(timeEvent || '').trim();

  if (rawTime && rawTime.includes('T')) {
    const parsed = Date.parse(rawTime);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (!rawDate) return null;

  const timePart = rawTime || '00:00:00';
  const hasZone = rawTime && /[zZ]|[+-]\d{2}:?\d{2}$/.test(rawTime);
  const raw = `${rawDate}T${timePart}${rawTime && hasZone ? '' : 'Z'}`;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function buildKickOffIso(event) {
  return formatDateToISO(event.dateEvent, event.strTimestamp || event.strTime);
}

function mapEventToFirestoreFormat(event, tournamentConfig) {
  return {
    HomeTeam: event.strHomeTeam || 'Unknown',
    AwayTeam: event.strAwayTeam || 'Unknown',
    KickOffTime: buildKickOffIso(event),
    Status: 'upcoming',
    League: tournamentConfig.displayName,
    thesportsdbEventId: event.idEvent,
    HomeScore: null,
    AwayScore: null,
    Stage: null,
    Group: null,
    Matchday: null,
    StageKey: null,
    tournamentId: tournamentConfig.tournamentId
  };
}

function isWorldCupEvent(event, tournamentConfig) {
  if (!event) return false;
  if (tournamentConfig.theSportsDbLeagueId && event.idLeague) {
    return event.idLeague === tournamentConfig.theSportsDbLeagueId;
  }
  const normalizedLeague = normalizeLeague(event.strLeague);
  if (!normalizedLeague) return false;
  return normalizedLeague.toLowerCase().includes('world cup');
}

async function searchFixture(homeTeamName, awayTeamName) {
  if (!homeTeamName || !awayTeamName) {
    console.error('[searchFixture] Both team names are required');
    return [];
  }

  try {
    const allEvents = [];
    const searchOrders = [
      `${homeTeamName}_vs_${awayTeamName}`,
      `${awayTeamName}_vs_${homeTeamName}`
    ];

    for (const eventSearch of searchOrders) {
      await enforceRateLimit();
      const url = `${THESPORTSDB_BASE_URL}/searchevents.php?e=${encodeURIComponent(eventSearch)}`;
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (data.event && Array.isArray(data.event)) {
        allEvents.push(...data.event);
      }
    }

    if (allEvents.length === 0) return [];

    const now = new Date();
    const eventIds = new Set();

    const fixtures = allEvents
      .filter(event => {
        if (eventIds.has(event.idEvent)) return false;
        eventIds.add(event.idEvent);
        const kickoffIso = buildKickOffIso(event);
        if (!kickoffIso) return false;
        const kickoffDate = new Date(kickoffIso);
        if (Number.isNaN(kickoffDate.getTime())) return false;
        return kickoffDate > now;
      })
      .filter(event => isWorldCupEvent(event, TOURNAMENT_CONFIG))
      .map(event => mapEventToFirestoreFormat(event, TOURNAMENT_CONFIG))
      .sort((a, b) => new Date(a.KickOffTime) - new Date(b.KickOffTime))
      .slice(0, 5);

    return fixtures;
  } catch (error) {
    console.error('[searchFixture] Error:', error.message);
    return [];
  }
}

function logFixtureDetails(fixture) {
  console.log(`[Fixture] ${fixture.HomeTeam} vs ${fixture.AwayTeam} | Kick-off: ${fixture.KickOffTime} | EventID: ${fixture.thesportsdbEventId}`);
}

module.exports = {
  searchTeam,
  searchFixture,
  logFixtureDetails
};
