/**
 * UI Helpers Module
 * Shared UI components and utilities across the EA App
 * Includes: Player history modal, leaderboard rendering, and modal management
 */

import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { calculatePoints, calculatePlayerStats, getPlayerStats, normalizePrediction } from "./calculations.js";
import { TOURNAMENT_CONFIG, resolveStageKey, resolveStageLabel } from "./tournament-config.js";

let cachedTournamentGames = null;
let cachedGamesMap = null;
let cachedAllPredictions = null;

async function loadTournamentGames(db) {
    if (cachedTournamentGames && cachedGamesMap) {
        return { gamesArray: cachedTournamentGames, gamesMap: cachedGamesMap };
    }

    const gamesSnapshot = await getDocs(query(
        collection(db, 'games'),
        where('tournamentId', '==', TOURNAMENT_CONFIG.tournamentId)
    ));

    const gamesArray = [];
    const gamesMap = {};

    gamesSnapshot.forEach(doc => {
        const gameData = {
            id: doc.id,
            ...doc.data(),
            status: (doc.data().Status || '').toLowerCase(),
            homeScore: doc.data().HomeScore,
            awayScore: doc.data().AwayScore,
            stageKey: doc.data().StageKey,
            stage: doc.data().Stage,
            group: doc.data().Group,
            matchday: doc.data().Matchday
        };
        gamesArray.push(gameData);
        gamesMap[doc.id] = gameData;
    });

    cachedTournamentGames = gamesArray;
    cachedGamesMap = gamesMap;

    return { gamesArray, gamesMap };
}

async function loadAllPredictions(db) {
    if (cachedAllPredictions) {
        return cachedAllPredictions;
    }

    const allPredictionsRef = collection(db, 'predictions');
    const allPredSnapshot = await getDocs(query(
        allPredictionsRef,
        where('tournamentId', '==', TOURNAMENT_CONFIG.tournamentId)
    ));
    const allPredictions = [];
    allPredSnapshot.forEach(doc => {
        allPredictions.push(normalizePrediction(doc.data()));
    });

    cachedAllPredictions = allPredictions;
    return allPredictions;
}

/**
 * Create and append player history modal to the DOM if it doesn't exist
 * Should be called once when the page loads
 */
export function createPlayerHistoryModal() {
    const existingModal = document.getElementById('player-history-modal');
    if (existingModal) return; // Modal already exists in HTML

    const modal = document.createElement('div');
    modal.id = 'player-history-modal';
    modal.className = 'player-history-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="player-history-title">Player History</h3>
                <span class="close-modal" onclick="document.getElementById('player-history-modal').style.display = 'none';">&times;</span>
            </div>
            <div class="modal-body">
                <div id="player-history-content"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closePlayerHistoryModal();
        }
    });
}

/**
 * Close the player history modal
 */
export function closePlayerHistoryModal() {
    const modal = document.getElementById('player-history-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Open player history modal with predictions and stats
 * @param {string} userId - The user ID to fetch history for
 * @param {object} db - Firestore database instance
 * @param {object} userDisplayNames - Map of userId to display names
 */
export async function openPlayerHistory(userId, db, userDisplayNames) {
    const modal = document.getElementById('player-history-modal');
    if (!modal) {
        console.error('Player history modal not found. Call createPlayerHistoryModal() first.');
        return;
    }

    console.log('Opening player history for userId:', userId);

    const titleEl = document.getElementById('player-history-title');
    const contentEl = document.getElementById('player-history-content');

    const playerName = userDisplayNames[userId] || userId;
    titleEl.textContent = `${playerName} - Historial de predicciones`;
    contentEl.innerHTML = '';
    const loading = document.createElement('p');
    loading.style.color = '#bdbdbd';
    loading.textContent = 'Cargando predicciones...';
    contentEl.appendChild(loading);
    modal.style.display = 'block';

    try {
        const [allPredictions, tournamentGames] = await Promise.all([
            loadAllPredictions(db),
            loadTournamentGames(db)
        ]);

        const { gamesArray, gamesMap } = tournamentGames;
        const userPredictions = allPredictions.filter(pred => pred.userId === userId);

        if (userPredictions.length === 0) {
            contentEl.innerHTML = '';
            const emptyMessage = document.createElement('p');
            emptyMessage.style.color = '#bdbdbd';
            emptyMessage.textContent = 'No hay predicciones para este jugador.';
            contentEl.appendChild(emptyMessage);
            return;
        }

        // Normalize predictions for calculations module
        const normalizedPredictions = userPredictions.map(pred => ({
            ...pred,
            userId: userId
        }));

        // Sort predictions by game kick-off time (descending, most recent first)
        normalizedPredictions.sort((a, b) => {
            const gameA = gamesMap[a.gameId];
            const gameB = gamesMap[b.gameId];
            const timeA = gameA && gameA.KickOffTime ? new Date(gameA.KickOffTime).getTime() : -Infinity;
            const timeB = gameB && gameB.KickOffTime ? new Date(gameB.KickOffTime).getTime() : -Infinity;
            return timeB - timeA;
        });

        // Use centralized calculatePlayerStats to get proper fechas won count
        const allPlayerStats = calculatePlayerStats(gamesArray, allPredictions);
        const playerStats = getPlayerStats(allPlayerStats, userId) || {
            totalPoints: 0,
            perfectScoresCount: 0,
            fechasWonCount: 0
        };

        contentEl.innerHTML = '';

        const statsContainer = document.createElement('div');
        statsContainer.style.cssText = 'margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, rgba(0, 229, 255, 0.1) 0%, rgba(118, 255, 3, 0.05) 100%); border-left: 3px solid #00e5ff; border-radius: 4px;';
        const statsGrid = document.createElement('div');
        statsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;';
        statsContainer.appendChild(statsGrid);

        const statsItems = [
            { value: playerStats.totalPoints, color: '#76ff03', label: 'Puntos totales' },
            { value: playerStats.perfectScoresCount, color: '#00e5ff', label: 'Perfectos' },
            { value: playerStats.fechasWonCount, color: '#ffeb3b', label: 'Fases ganadas' }
        ];

        statsItems.forEach(item => {
            const itemContainer = document.createElement('div');
            itemContainer.style.textAlign = 'center';

            const valueEl = document.createElement('div');
            valueEl.style.cssText = `font-size: 1.8rem; font-weight: 700; color: ${item.color};`;
            valueEl.textContent = String(item.value);

            const labelEl = document.createElement('div');
            labelEl.style.cssText = 'font-size: 0.75rem; color: #7e8a99; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;';
            labelEl.textContent = item.label;

            itemContainer.appendChild(valueEl);
            itemContainer.appendChild(labelEl);
            statsGrid.appendChild(itemContainer);
        });

        contentEl.appendChild(statsContainer);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'max-height: 500px; overflow-y: auto;';

        normalizedPredictions.forEach(pred => {
            const game = gamesMap[pred.gameId];
            if (!game) return;

            const points = calculatePoints(pred, game);
            const pointsClass = points === null ? 'pending' : points === 10 ? 'perfect' : points >= 7 ? 'high' : points >= 4 ? 'medium' : points > 0 ? 'low' : 'zero';
            const pointsDisplay = points === null ? 'N/A' : `${points}p`;

            const gameDate = new Date(game.KickOffTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const phaseLabel = resolveStageLabel(game);

            const entry = document.createElement('div');
            entry.className = 'prediction-entry';

            const details = document.createElement('div');
            details.style.flex = '1';

            const matchup = document.createElement('div');
            matchup.style.cssText = 'font-weight: 600; color: #f0f0f0;';
            matchup.textContent = `${game.HomeTeam} vs ${game.AwayTeam}`;

            const meta = document.createElement('div');
            meta.style.cssText = 'font-size: 0.85rem; color: #9e9e9e; margin-top: 4px;';

            const phaseSpan = document.createElement('span');
            phaseSpan.textContent = `Phase: ${phaseLabel}`;

            const predictedSpan = document.createElement('span');
            predictedSpan.style.marginLeft = '8px';
            const predictedHome = pred.predictedHomeScore ?? '-';
            const predictedAway = pred.predictedAwayScore ?? '-';
            predictedSpan.textContent = `Prediccion: ${predictedHome} - ${predictedAway}`;

            meta.appendChild(phaseSpan);
            meta.appendChild(predictedSpan);

            if (game.Status === 'finished' && game.HomeScore !== null) {
                const actualSpan = document.createElement('span');
                actualSpan.textContent = ` | Actual: ${game.HomeScore} - ${game.AwayScore}`;
                meta.appendChild(actualSpan);
            }

            const dateSpan = document.createElement('span');
            dateSpan.style.cssText = 'margin-left: 8px; font-size: 0.75rem;';
            dateSpan.textContent = gameDate;
            meta.appendChild(dateSpan);

            details.appendChild(matchup);
            details.appendChild(meta);

            const scoreBadge = document.createElement('span');
            scoreBadge.className = `score ${pointsClass}`;
            scoreBadge.textContent = pointsDisplay;

            entry.appendChild(details);
            entry.appendChild(scoreBadge);

            listContainer.appendChild(entry);
        });
        contentEl.appendChild(listContainer);

    } catch (error) {
        console.error("Error loading player history: ", error);
        contentEl.innerHTML = '';
        const errorMessage = document.createElement('p');
        errorMessage.style.color = '#ff6b6b';
        errorMessage.textContent = 'Error loading player history. Please try again.';
        contentEl.appendChild(errorMessage);
    }
}

/**
 * Render the overall leaderboard table
 * @param {array} sortedPlayers - Array of [userId, stats] tuples
 * @param {object} userNames - Map of userId to display names
 * @param {function} onPlayerClick - Callback when player is clicked
 * @returns {HTMLElement} - The constructed table element
 */
export function renderLeaderboardTable(sortedPlayers, userNames, onPlayerClick) {
    const table = document.createElement('table');
    table.classList.add('table', 'table-dark', 'table-striped', 'table-hover');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const headers = [
        { label: '#', className: '' },
        { label: 'Player', className: '' },
        { label: 'Total Points', className: '' },
        { label: 'Phases Won', className: 'text-center' },
        { label: 'Perfect Scores (10s)', className: 'text-center' }
    ];

    headers.forEach(header => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = header.label;
        if (header.className) {
            th.className = header.className;
        }
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');

    sortedPlayers.forEach(([userId, stats], index) => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.dataset.userId = userId;
        row.title = 'Click to view prediction history';

        const rankCell = document.createElement('th');
        rankCell.scope = 'row';
        rankCell.textContent = String(index + 1);

        const playerCell = document.createElement('td');
        const playerStrong = document.createElement('strong');
        playerStrong.textContent = userNames[userId] || 'Anonymous';
        playerCell.appendChild(playerStrong);

        const totalCell = document.createElement('td');
        const totalBadge = document.createElement('span');
        totalBadge.className = 'badge badge-light badge-pill';
        totalBadge.textContent = String(stats.totalPoints);
        totalCell.appendChild(totalBadge);

        const phasesCell = document.createElement('td');
        phasesCell.className = 'text-center';
        const phasesBadge = document.createElement('span');
        phasesBadge.className = 'badge badge-info';
        phasesBadge.textContent = String(stats.fechasWonCount);
        phasesCell.appendChild(phasesBadge);

        const perfectCell = document.createElement('td');
        perfectCell.className = 'text-center';
        const perfectBadge = document.createElement('span');
        perfectBadge.className = 'badge badge-warning';
        perfectBadge.textContent = String(stats.perfectScoresCount);
        perfectCell.appendChild(perfectBadge);

        row.appendChild(rankCell);
        row.appendChild(playerCell);
        row.appendChild(totalCell);
        row.appendChild(phasesCell);
        row.appendChild(perfectCell);

        tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    // Add click handler to table using event delegation
    table.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-user-id]');
        if (row && onPlayerClick) {
            const userId = row.getAttribute('data-user-id');
            console.log('Row clicked! UserId:', userId);
            onPlayerClick(userId);
        }
    });

    return table;
}

/**
 * Make openPlayerHistory available globally for onclick handlers
 * Call this in your HTML script to set up the global reference
 * @param {function} callback - Function to call when player is clicked
 */
export function setupPlayerClickHandlers(callback) {
    window.openPlayerHistoryGlobal = callback;
    
    // Setup event delegation for player history trigger elements
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.player-history-trigger');
        if (trigger && callback) {
            const userId = trigger.getAttribute('data-user-id');
            if (userId) {
                console.log('Player trigger clicked! UserId:', userId);
                callback(userId);
            }
        }
    });
}

/**
 * Create a phase selector UI component with isolated namespace
 * @param {array} phaseKeys - Array of phase keys (e.g., ['GROUP-A-MD1', 'R16'])
 * @param {function} onSelectPhase - Callback function when a phase is selected
 * @param {string} containerId - ID of the container where buttons will be rendered
 * @param {string} selectedPhase - Currently selected phase (optional)
 * @param {string} callbackNamespace - Optional namespace to avoid conflicts (default: 'phaseCallback')
 */
export function createPhaseSelector(phaseKeys, onSelectPhase, containerId, selectedPhase = null, callbackNamespace = 'phaseCallback', getPhaseLabel = null) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID "${containerId}" not found.`);
        return;
    }

    // Create a unique namespace for this selector to avoid conflicts
    if (!window.phaseSelectors) {
        window.phaseSelectors = {};
    }
    window.phaseSelectors[callbackNamespace] = onSelectPhase;

    container.innerHTML = phaseKeys.map(phaseKey => `
        <button class="btn btn-outline-secondary phase-button" 
                onclick="window.phaseSelectors['${callbackNamespace}']('${phaseKey}')" 
                data-phase="${phaseKey}">
            ${getPhaseLabel ? getPhaseLabel(phaseKey) : phaseKey}
        </button>
    `).join('');

    // Apply active state to the selected phase
    if (selectedPhase) {
        updatePhaseSelectorState(containerId, selectedPhase);
    }
}

/**
 * Update phase selector active state
 * @param {string} containerId - ID of the container with phase buttons
 * @param {string} selectedPhase - Phase to mark as active
 */
export function updatePhaseSelectorState(containerId, selectedPhase) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const buttons = container.querySelectorAll('.phase-button');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-phase') === selectedPhase) {
            btn.classList.add('active');
        }
    });
}

/**
 * Filter predictions by phase
 * @param {array} predictions - Array of prediction objects with gameId
 * @param {Map} gamesMap - Map of gameId to game objects
 * @param {string} phaseKey - Phase key to filter by (e.g., 'GROUP-A-MD1')
 * @returns {array} - Filtered predictions for the specified phase
 */
export function filterPredictionsByPhase(predictions, gamesMap, phaseKey) {
    return predictions.filter(pred => {
        const game = gamesMap.get(pred.gameId);
        return game && resolveStageKey(game) === phaseKey;
    });
}
