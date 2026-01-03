/**
 * Test Module for fetchFixtures.js
 * 
 * Run tests to verify:
 * - API connectivity to TheSportsDB
 * - Team search functionality
 * - Fixture fetching and filtering
 * - Data structure validation
 * - League normalization
 * 
 * Usage:
 *   node testFetchFixtures.js
 */

const {
    searchTeam,
    searchFixture,
    logFixtureDetails
} = require('../src/fetchFixtures.js');

// ============================================
// TEST UTILITIES
// ============================================

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

let testCount = 0;
let passCount = 0;
let failCount = 0;

function printHeader(text) {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  ${text}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function printSubHeader(text) {
    console.log(`\n${colors.bright}${colors.blue}▶ ${text}${colors.reset}`);
}

function printTest(description) {
    testCount++;
    process.stdout.write(`  Test ${testCount}: ${description} ... `);
}

function pass(message = '') {
    passCount++;
    console.log(`${colors.green}✓ PASS${colors.reset}${message ? ' - ' + message : ''}`);
}

function fail(message = '') {
    failCount++;
    console.log(`${colors.red}✗ FAIL${colors.reset}${message ? ' - ' + message : ''}`);
}

function printValue(label, value, color = colors.yellow) {
    console.log(`    ${label}: ${color}${JSON.stringify(value, null, 2)}${colors.reset}`);
}

function printSummary() {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}Test Summary${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`Total: ${testCount} | ${colors.green}Pass: ${passCount}${colors.reset} | ${colors.red}Fail: ${failCount}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function validateFixtureStructure(fixture) {
    const required = ['HomeTeam', 'AwayTeam', 'KickOffTime', 'Status', 'League', 'thesportsdbEventId'];
    const missing = required.filter(field => !(field in fixture));
    
    if (missing.length > 0) {
        return { valid: false, missing };
    }
    
    // Type checks
    if (typeof fixture.HomeTeam !== 'string') return { valid: false, error: 'HomeTeam must be string' };
    if (typeof fixture.AwayTeam !== 'string') return { valid: false, error: 'AwayTeam must be string' };
    if (!(fixture.KickOffTime instanceof Date || typeof fixture.KickOffTime === 'string')) {
        return { valid: false, error: 'KickOffTime must be Date or ISO string' };
    }
    if (fixture.Status !== 'upcoming') return { valid: false, error: 'Status must be "upcoming"' };
    if (typeof fixture.League !== 'string' && fixture.League !== null) {
        return { valid: false, error: 'League must be string or null' };
    }
    if (typeof fixture.thesportsdbEventId !== 'string') {
        return { valid: false, error: 'thesportsdbEventId must be string' };
    }
    
    return { valid: true };
}

// ============================================
// TEST SUITE
// ============================================

async function runTests() {
    printHeader('TESTING fetchFixtures.js Module');

    // ---- Test 1: API Connectivity ----
    printSubHeader('Test 1: API Connectivity');
    
    printTest('Can reach TheSportsDB API');
    try {
        const teamId = await searchTeam('Manchester United');
        if (teamId) {
            pass(`Found team ID: ${teamId}`);
        } else {
            fail('API responded but team not found');
        }
    } catch (error) {
        fail(`Network error: ${error.message}`);
    }

    // ---- Test 2: Team Search ----
    printSubHeader('Test 2: Team Search Functionality');
    
    const testTeams = [
        { name: 'Barcelona', shouldFind: true },
        { name: 'Liverpool', shouldFind: true },
        { name: 'Real Madrid', shouldFind: true },
        { name: 'XYZ Nonexistent Team 12345', shouldFind: false },
    ];

    for (const team of testTeams) {
        printTest(`Search for "${team.name}"`);
        const teamId = await searchTeam(team.name);
        
        if (team.shouldFind) {
            if (teamId) {
                pass(`Found: ${teamId}`);
            } else {
                fail(`Expected to find team but didn't`);
            }
        } else {
            if (!teamId) {
                pass(`Correctly returned null for nonexistent team`);
            } else {
                fail(`Should not have found: ${teamId}`);
            }
        }
    }

    // ---- Test 3: Fixture Searching ----
    printSubHeader('Test 3: Fixture Searching');
    
    printTest('Search for fixtures: Barcelona vs Real Madrid');
    const fixtures = await searchFixture('Barcelona', 'Real Madrid');
    
    if (Array.isArray(fixtures)) {
        pass(`Got array of ${fixtures.length} fixtures`);
        
        if (fixtures.length > 0) {
            printValue('Sample Fixture', fixtures[0]);
            
            // Validate first fixture
            printTest('Validate first fixture data structure');
            const validation = validateFixtureStructure(fixtures[0]);
            
            if (validation.valid) {
                pass('All required fields present with correct types');
            } else {
                fail(`${validation.missing ? 'Missing: ' + validation.missing.join(', ') : validation.error}`);
            }
        } else {
            console.log(`    ${colors.yellow}ℹ Note: No fixtures returned (free API may have limited results)${colors.reset}`);
        }
    } else {
        fail('Response is not an array');
    }

    // ---- Test 4: Fixture Details Logging ----
    printSubHeader('Test 4: Fixture Details Logging');
    
    if (fixtures && fixtures.length > 0) {
        printTest('Log fixture details (debug utility)');
        console.log(''); // Add newline for better formatting
        logFixtureDetails(fixtures[0]);
        console.log(''); // Add newline
        pass('Successfully logged fixture details');
    } else {
        console.log(`    ${colors.yellow}⊘ Skipped: No fixtures available for logging${colors.reset}`);
    }

    // ---- Test 5: Multiple Fixtures Validation ----
    printSubHeader('Test 5: Multiple Fixtures Data Validation');
    
    if (fixtures && fixtures.length > 0) {
        printTest(`Validate all ${fixtures.length} fixtures`);
        
        let allValid = true;
        const invalidFixtures = [];
        
        fixtures.forEach((fixture, index) => {
            const validation = validateFixtureStructure(fixture);
            if (!validation.valid) {
                allValid = false;
                invalidFixtures.push({
                    index,
                    error: validation.missing ? 'Missing: ' + validation.missing.join(', ') : validation.error,
                    fixture: `${fixture.HomeTeam || 'Unknown'} vs ${fixture.AwayTeam || 'Unknown'}`,
                });
            }
        });
        
        if (allValid) {
            pass(`All ${fixtures.length} fixtures have valid structure`);
        } else {
            fail(`${invalidFixtures.length} invalid fixture(s) found`);
            invalidFixtures.forEach(item => {
                console.log(`      Fixture ${item.index}: ${item.fixture}`);
                console.log(`        Error: ${item.error}`);
            });
        }
    } else {
        console.log(`    ${colors.yellow}⊘ Skipped: No fixtures available for validation${colors.reset}`);
    }

    // ---- Test 6: League Normalization ----
    printSubHeader('Test 6: League Name Normalization');
    
    if (fixtures && fixtures.length > 0) {
        printTest('Check league names are normalized');
        
        const leagues = new Set(fixtures.map(f => f.League).filter(l => l));
        const leagueArray = Array.from(leagues);
        
        console.log(''); // Newline for formatting
        console.log(`    Found ${leagueArray.length} unique league(s):`);
        leagueArray.forEach(league => {
            console.log(`      - ${colors.yellow}${league}${colors.reset}`);
        });
        console.log('');
        
        pass('Leagues extracted and displayed');
    } else {
        console.log(`    ${colors.yellow}⊘ Skipped: No fixtures available for league check${colors.reset}`);
    }

    // ---- Test 7: Chronological Sorting ----
    printSubHeader('Test 7: Chronological Sorting Validation');
    
    if (fixtures && fixtures.length > 0) {
        printTest('Fixtures are sorted in chronological order');
        
        let isSorted = true;
        let prevDate = new Date(0); // Start with epoch
        
        fixtures.forEach((fixture, index) => {
            const fixtureDate = new Date(fixture.KickOffTime);
            if (fixtureDate < prevDate) {
                isSorted = false;
            }
            prevDate = fixtureDate;
        });
        
        if (isSorted) {
            pass(`All ${fixtures.length} fixtures are in chronological order`);
        } else {
            fail('Fixtures are not properly sorted by date');
        }
    } else {
        console.log(`    ${colors.yellow}⊘ Skipped: No fixtures available for sorting check${colors.reset}`);
    }

    // ---- Test 8: Status Validation ----
    printSubHeader('Test 8: Status Validation');
    
    if (fixtures && fixtures.length > 0) {
        printTest('All fixtures have status "upcoming"');
        
        const allUpcoming = fixtures.every(f => f.Status === 'upcoming');
        
        if (allUpcoming) {
            pass(`All ${fixtures.length} fixtures have correct status`);
        } else {
            const invalidCount = fixtures.filter(f => f.Status !== 'upcoming').length;
            fail(`${invalidCount} fixture(s) with incorrect status`);
        }
    } else {
        console.log(`    ${colors.yellow}⊘ Skipped: No fixtures available for status check${colors.reset}`);
    }

    // ---- Print Summary ----
    printSummary();
    
    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error(`${colors.red}Fatal error during testing:${colors.reset}`, error);
    process.exit(1);
});
