/**
 * Admin Panel Module
 * 
 * Handles all admin-related functionality:
 * - Admin form initialization and DOM references
 * - Game addition to Firestore
 * - Form submission and validation
 * 
 * Usage:
 *   import { initializeAdminPanel } from './admin-panel.js';
 *   await initializeAdminPanel(db, auth, ADMIN_UID);
 */

import { TOURNAMENT_CONFIG, buildStageKey, isGroupStage } from './tournament-config.js';

// Admin DOM References
let adminGameFormSection;
let adminHomeTeamInput;
let adminAwayTeamInput;
let adminStageSelect;
let adminGroupSelect;
let adminMatchdaySelect;
let adminKickOffTimeInput;
let adminStatusSelect;
let adminHomeScoreInput;
let adminAwayScoreInput;
let adminManualOverrideInput;
let addGameButton;
let gameMessageDiv;
// Fixture search removed for single-tournament scope

// Database references (passed in during initialization)
let db;
let addDocFunction;
let collectionFunction;

/**
 * Initialize admin panel by getting all DOM references
 * @param {object} database - Firestore database instance
 * @param {function} addDoc - Firestore addDoc function
 * @param {function} collection - Firestore collection function
 */
export function initializeAdminPanel(database, addDoc, collection) {
    db = database;
    addDocFunction = addDoc;
    collectionFunction = collection;
    
    // Debug logging (ASCII-only to avoid encoding issues)
    console.log("Admin panel initialized with:");
    console.log("  db:", !!db ? "OK" : "MISSING");
    console.log("  addDocFunction:", !!addDocFunction ? "OK" : "MISSING");
    console.log("  collectionFunction:", !!collectionFunction ? "OK" : "MISSING");
    
    // Get all admin form references
    adminGameFormSection = document.getElementById('admin-game-form-section');
    adminHomeTeamInput = document.getElementById('adminHomeTeam');
    adminAwayTeamInput = document.getElementById('adminAwayTeam');
    adminStageSelect = document.getElementById('adminStage');
    adminGroupSelect = document.getElementById('adminGroup');
    adminMatchdaySelect = document.getElementById('adminMatchday');
    adminKickOffTimeInput = document.getElementById('adminKickOffTime');
    adminStatusSelect = document.getElementById('adminStatus');
    adminHomeScoreInput = document.getElementById('adminHomeScore');
    adminAwayScoreInput = document.getElementById('adminAwayScore');
    adminManualOverrideInput = document.getElementById('adminManualOverride');
    addGameButton = document.getElementById('addGameButton');
    gameMessageDiv = document.getElementById('gameMessage');
    
    // Attach event listeners
    if (addGameButton) {
        addGameButton.addEventListener('click', handleAdminGameAdd);
    }
    if (adminStageSelect) {
        adminStageSelect.addEventListener('change', updateGroupMatchdayInputs);
    }
}

/**
 * Show/hide admin form section
 * @param {boolean} show - Whether to show the form
 */
export function toggleAdminForm(show) {
    if (adminGameFormSection) {
        adminGameFormSection.style.display = show ? 'block' : 'none';
    }
    // Clear any error messages when showing the form
    if (show) {
        if (gameMessageDiv) gameMessageDiv.textContent = '';
    }
}

/**
 * Handle admin game addition
 */
export async function handleAdminGameAdd() {
    gameMessageDiv.textContent = 'Adding game...';
    gameMessageDiv.style.color = 'orange';
    addGameButton.disabled = true;

    const homeTeam = adminHomeTeamInput.value.trim();
    const awayTeam = adminAwayTeamInput.value.trim();
    const stage = adminStageSelect.value;
    const group = adminGroupSelect.value || null;
    const matchday = adminMatchdaySelect.value ? parseInt(adminMatchdaySelect.value, 10) : null;
    const kickOffTimeStr = adminKickOffTimeInput.value;
    const status = adminStatusSelect.value;
    const externalStatus = status === 'finished' ? 'FINISHED' : status === 'live' ? 'IN_PLAY' : 'SCHEDULED';
    const homeScore = adminHomeScoreInput.value ? parseInt(adminHomeScoreInput.value, 10) : null;
    const awayScore = adminAwayScoreInput.value ? parseInt(adminAwayScoreInput.value, 10) : null;
    const isManuallyEdited = adminManualOverrideInput ? adminManualOverrideInput.checked : false;
    // Basic validation
    if (!homeTeam || !awayTeam || !stage || !kickOffTimeStr || !status) {
        gameMessageDiv.textContent = 'Please fill in all required fields (Teams, Stage, Kick-off Time, Status).';
        gameMessageDiv.style.color = 'red';
        addGameButton.disabled = false;
        return;
    }
    if (homeTeam === awayTeam) {
        gameMessageDiv.textContent = 'Home Team and Away Team cannot be the same.';
        gameMessageDiv.style.color = 'red';
        addGameButton.disabled = false;
        return;
    }
    if (isGroupStage(stage)) {
        if (!group || !matchday) {
            gameMessageDiv.textContent = 'Please select a Group and Matchday for Group Stage matches.';
            gameMessageDiv.style.color = 'orange';
            addGameButton.disabled = false;
            return;
        }
    }

    try {
        const kickOffTime = new Date(kickOffTimeStr);
        if (isNaN(kickOffTime.getTime())) {
            gameMessageDiv.textContent = 'Invalid Kick-off Time.';
            gameMessageDiv.style.color = 'red';
            addGameButton.disabled = false;
            return;
        }

        const stageKey = buildStageKey({ stage, group, matchday });
        const gameData = {
            tournamentId: TOURNAMENT_CONFIG.tournamentId,
            HomeTeam: homeTeam,
            AwayTeam: awayTeam,
            KickOffTime: kickOffTime.toISOString(),
            utcDate: kickOffTime.toISOString(),
            Status: status,
            status: externalStatus,
            Stage: stage,
            Group: group,
            Matchday: matchday,
            StageKey: stageKey,
            isManuallyEdited: isManuallyEdited,
            syncStatus: 'manual',
            syncError: null,
            score: {
                home: homeScore,
                away: awayScore,
                fullTime: {
                    home: homeScore,
                    away: awayScore
                },
                halfTime: {
                    home: null,
                    away: null
                }
            }
        };

        if (status === 'finished' || status === 'live') {
            gameData.HomeScore = homeScore;
            gameData.AwayScore = awayScore;
        } else {
            gameData.HomeScore = null;
            gameData.AwayScore = null;
        }

        // Use the Firestore functions passed during initialization
        console.log("Before adding game - checking functions:");
        console.log("  addDocFunction:", !!addDocFunction ? "OK" : "MISSING");
        console.log("  collectionFunction:", !!collectionFunction ? "OK" : "MISSING");
        console.log("  db:", !!db ? "OK" : "MISSING");
        
        if (!addDocFunction || !collectionFunction) {
            throw new Error("Firestore functions not initialized. This is a bug in the initialization code.");
        }
        
        await addDocFunction(collectionFunction(db, 'games'), gameData);
        gameMessageDiv.textContent = 'Game added successfully!';
        gameMessageDiv.style.color = 'green';

        // Clear form for next entry
        clearAdminForm();
        
        // Notify parent that data was updated
        window.dispatchEvent(new Event('adminGameAdded'));

    } catch (error) {
        console.error("Error adding game: ", error);
        gameMessageDiv.textContent = `Error adding game: ${error.message}`;
        gameMessageDiv.style.color = 'red';
    } finally {
        addGameButton.disabled = false;
    }
}

/**
 * Clear the admin form
 */
function clearAdminForm() {
    adminHomeTeamInput.value = "";
    adminAwayTeamInput.value = "";
    adminStatusSelect.value = "upcoming";
    if (adminStageSelect) {
        adminStageSelect.value = "";
    }
    if (adminGroupSelect) {
        adminGroupSelect.value = "";
    }
    if (adminMatchdaySelect) {
        adminMatchdaySelect.value = "";
    }
    adminHomeScoreInput.value = "";
    adminAwayScoreInput.value = "";
    if (adminManualOverrideInput) {
        adminManualOverrideInput.checked = false;
    }
}

function updateGroupMatchdayInputs() {
    if (!adminStageSelect || !adminGroupSelect || !adminMatchdaySelect) return;

    const stage = adminStageSelect.value;
    const isGroup = isGroupStage(stage);

    adminGroupSelect.disabled = !isGroup;
    adminMatchdaySelect.disabled = !isGroup;

    if (!isGroup) {
        adminGroupSelect.value = "";
        adminMatchdaySelect.value = "";
    }
}

/**
 * Populate admin dropdowns for tournament stages and groups
 */
export async function populateAdminDropdowns() {
    try {
        if (!adminStageSelect || !adminGroupSelect || !adminMatchdaySelect) {
            console.warn('Admin stage inputs not found - form may not be initialized yet');
            return;
        }

        adminStageSelect.innerHTML = '';
        const defaultStageOption = document.createElement('option');
        defaultStageOption.value = "";
        defaultStageOption.textContent = "Select stage";
        defaultStageOption.disabled = true;
        defaultStageOption.selected = true;
        adminStageSelect.appendChild(defaultStageOption);

        TOURNAMENT_CONFIG.stages.forEach(stage => {
            const option = document.createElement('option');
            option.value = stage.id;
            option.textContent = stage.label;
            adminStageSelect.appendChild(option);
        });

        adminGroupSelect.innerHTML = '';
        const defaultGroupOption = document.createElement('option');
        defaultGroupOption.value = "";
        defaultGroupOption.textContent = "Select group";
        defaultGroupOption.disabled = true;
        defaultGroupOption.selected = true;
        adminGroupSelect.appendChild(defaultGroupOption);

        TOURNAMENT_CONFIG.groups.forEach(groupName => {
            const option = document.createElement('option');
            option.value = groupName;
            option.textContent = `Group ${groupName}`;
            adminGroupSelect.appendChild(option);
        });

        adminMatchdaySelect.innerHTML = '';
        const defaultMatchdayOption = document.createElement('option');
        defaultMatchdayOption.value = "";
        defaultMatchdayOption.textContent = "Select matchday";
        defaultMatchdayOption.disabled = true;
        defaultMatchdayOption.selected = true;
        adminMatchdaySelect.appendChild(defaultMatchdayOption);

        TOURNAMENT_CONFIG.matchdays.forEach(matchday => {
            const option = document.createElement('option');
            option.value = matchday;
            option.textContent = `Matchday ${matchday}`;
            adminMatchdaySelect.appendChild(option);
        });

        // Set default kick-off time
        if (adminKickOffTimeInput) {
            const now = new Date();
            now.setHours(now.getHours() + 24);
            const isoString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, -8);
            adminKickOffTimeInput.value = isoString;
        }

        updateGroupMatchdayInputs();
        console.log('Admin dropdowns populated successfully');

    } catch (error) {
        console.error("Error populating admin dropdowns:", error);
        if (gameMessageDiv) {
            gameMessageDiv.textContent = `Error loading admin form data: ${error.message}`;
            gameMessageDiv.style.color = 'red';
        }
        throw error; // Re-throw so caller knows there was an error
    }
}

export function populateTeamDatalist(teams) {
    console.log("populateTeamDatalist called with teams:", teams);
    
    const datalist = document.getElementById('teamNamesList');
    if (!datalist) {
        console.warn("Datalist element 'teamNamesList' not found in DOM");
        return;
    }
    
    // Clear existing options
    datalist.innerHTML = '';
    
    // Add all team names as options
    if (Array.isArray(teams) && teams.length > 0) {
        teams.forEach(team => {
            const teamName = typeof team === 'string' ? team : team.name || team;
            if (teamName) {
                const option = document.createElement('option');
                option.value = teamName;
                datalist.appendChild(option);
            }
        });
        console.log(`Added ${teams.length} teams to datalist`);
    } else {
        console.warn("No teams provided to populateTeamDatalist");
    }
}
