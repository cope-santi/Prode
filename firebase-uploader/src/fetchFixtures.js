/**
 * Fixture Fetcher Module for TheSportsDB
 * 
 * Provides functions to search for fixtures between two teams
 * and map results to Firestore format with thesportsdbEventId.
 * 
 * Usage:
 *   import { searchFixture, searchTeam } from './fetchFixtures.js';
 *   const fixtures = await searchFixture('Barcelona', 'Real Madrid');
 */

import { TOURNAMENT_CONFIG } from '../../js/tournament-config.js';

// TheSportsDB API Configuration
const THESPORTSDB_API_KEY = '123'; // Your free API key from TheSportsDB
const THESPORTSDB_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}`;

// Rate limiting: 30 requests per minute for free tier
// That's approximately 1 request every 2 seconds (2000ms)
// Using 2100ms to be safe with a small buffer
const RATE_LIMIT_MS = 2100;
let lastRequestTime = 0;

/**
 * Helper function to enforce rate limiting
 * Ensures we don't exceed TheSportsDB API limits
 */
async function enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < RATE_LIMIT_MS) {
        const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
        console.log(`Rate limiting: waiting ${waitTime}ms before next API request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();
}

/**
 * Search for a team by name on TheSportsDB
 * 
 * @param {string} teamName - Team name to search for (e.g., "Manchester United")
 * @returns {Promise<object|null>} Object with {idTeam, strTeam} or null if not found
 */
export async function searchTeam(teamName) {
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

/**
 * Normalize competition/league name from TheSportsDB
 * Maps various league names to standard competition names
 * 
 * @param {string} strLeague - League name from TheSportsDB
 * @returns {string} Normalized league name for your app
 */
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
        'International Friendly': 'International Friendlies',
    };
    
    // Check for exact matches first
    if (leagueMap[strLeague]) {
        return leagueMap[strLeague];
    }
    
    // Check for partial matches
    for (const [key, value] of Object.entries(leagueMap)) {
        if (strLeague.includes(key) || key.includes(strLeague)) {
            return value;
        }
    }
    
    // If no match found, return the original (user can select manually)
    return strLeague;
}



/**
 * Format TheSportsDB date to ISO string (Firestore compatible)
 * TheSportsDB format: "2025-01-15 15:00:00"
 * Output: "2025-01-15T15:00:00.000Z" (ISO 8601)
 * 
 * @param {string} dateString - TheSportsDB date string
 * @returns {string} ISO formatted date string
 */
function formatDateToISO(dateString) {
    if (!dateString) return null;
    
    try {
        const date = new Date(dateString);
        return date.toISOString();
    } catch (error) {
        console.error('[formatDateToISO] Error parsing date:', error);
        return null;
    }
}

/**
 * Map TheSportsDB event data to Firestore game format
 * Includes auto-populated League when available
 * 
 * @param {object} event - Event object from TheSportsDB
 * @returns {object} Game object formatted for Firestore
 */
function mapEventToFirestoreFormat(event) {
    return {
        HomeTeam: event.strHomeTeam || 'Unknown',
        AwayTeam: event.strAwayTeam || 'Unknown',
        KickOffTime: formatDateToISO(event.dateEvent),
        Status: 'upcoming',
        League: TOURNAMENT_CONFIG.displayName,
        thesportsdbEventId: event.idEvent,
        HomeScore: null,
        AwayScore: null,
        Stage: null,
        Group: null,
        Matchday: null,
        StageKey: null,
        tournamentId: TOURNAMENT_CONFIG.tournamentId
    };
}

function isWorldCupEvent(event) {
    if (!event) return false;
    if (TOURNAMENT_CONFIG.theSportsDbLeagueId && event.idLeague) {
        return event.idLeague === TOURNAMENT_CONFIG.theSportsDbLeagueId;
    }
    const normalizedLeague = normalizeLeague(event.strLeague);
    if (!normalizedLeague) return false;
    return normalizedLeague.toLowerCase().includes('world cup');
}

/**
 * Search for fixtures between two teams
 * Tries both team orders since the API is order-sensitive
 * Returns up to 5 upcoming fixtures sorted chronologically
 * 
 * @param {string} homeTeamName - Home team name (e.g., "Manchester United")
 * @param {string} awayTeamName - Away team name (e.g., "Liverpool")
 * @returns {Promise<array>} Array of fixture objects in Firestore format
 */
export async function searchFixture(homeTeamName, awayTeamName) {
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
        
        if (allEvents.length === 0) {
            return [];
        }
        
        const now = new Date();
        const eventIds = new Set();
        
        const fixtures = allEvents
            .filter(event => {
                if (eventIds.has(event.idEvent)) return false;
                eventIds.add(event.idEvent);
                return new Date(event.dateEvent) > now;
            })
            .filter(event => isWorldCupEvent(event))
            .map(event => mapEventToFirestoreFormat(event))
            .sort((a, b) => new Date(a.KickOffTime) - new Date(b.KickOffTime))
            .slice(0, 5);
        
        return fixtures;
    } catch (error) {
        console.error('[searchFixture] Error:', error.message);
        return [];
    }
}


/**
 * Debug function: Log fixture details for inspection
 * 
 * @param {object} fixture - Fixture object to inspect
 */
export function logFixtureDetails(fixture) {
    console.log(`
    ╔════════════════════════════════════╗
    ║         FIXTURE DETAILS            ║
    ╠════════════════════════════════════╣
    ║ Home Team: ${fixture.HomeTeam.padEnd(30)} ║
    ║ Away Team: ${fixture.AwayTeam.padEnd(30)} ║
    ║ Kick-off:  ${new Date(fixture.KickOffTime).toLocaleString().padEnd(30)} ║
    ║ League:    ${(fixture.League || 'TBD').padEnd(30)} ║
    ║ EventID:   ${fixture.thesportsdbEventId.padEnd(30)} ║
    ╚════════════════════════════════════╝
    `);
}
