import { buildStageKey } from './tournament-config.js';

/**
 * EA Predictor - Standardized Calculations Module
 * 
 * This module provides centralized scoring and data aggregation logic
 * to avoid inconsistencies across different HTML pages.
 * 
 * All pages should use userId as the primary identifier (not playerName)
 * since playerName can change but userId is permanent.
 */

// ============================================
// SCORING LOGIC - Core Points Calculation
// ============================================

/**
 * Calculates points for a single prediction against actual game result
 * 
 * @param {Object} prediction - Prediction object with predictedHomeScore, predictedAwayScore
 * @param {Object} game - Game object with status, HomeScore, AwayScore
 * @returns {number|null} Points earned (0-10) or null if game not finished
 * 
 * Scoring Rules:
 * - Correct Winner/Draw: +5 points
 * - Correct Home Score: +2 points
 * - Correct Away Score: +2 points
 * - Correct Goal Difference (abs): +1 point
 * Maximum: 10 points
 */
function calculatePoints(prediction, game) {
  // Normalize game object to handle both uppercase and lowercase properties
  const gameStatus = (game.status || game.Status || '').toLowerCase();
  const homeScore = game.homeScore !== undefined ? game.homeScore : game.HomeScore;
  const awayScore = game.awayScore !== undefined ? game.awayScore : game.AwayScore;

  // Initial checks
  if (gameStatus !== 'finished' || homeScore === null || awayScore === null) {
    return null; // Game not finished or actual scores not available
  }

  const predictedHome = prediction.predictedHomeScore;
  const predictedAway = prediction.predictedAwayScore;
  const actualHome = homeScore;
  const actualAway = awayScore;

  if (predictedHome === null || predictedAway === null) {
    return 0; // No valid prediction entered for this game
  }

  let points = 0;

  // Determine outcomes
  const predictedOutcome =
    predictedHome > predictedAway ? 'HW' : (predictedHome < predictedAway ? 'AW' : 'D');
  const actualOutcome =
    actualHome > actualAway ? 'HW' : (actualHome < actualAway ? 'AW' : 'D');

  // Determine goal differences
  const predictedGoalDifference = predictedHome - predictedAway;
  const actualGoalDifference = actualHome - actualAway;

  // Apply Scoring Rules
  if (predictedOutcome === actualOutcome) {
    points += 5; // Correct Winner/Draw
  }
  if (predictedHome === actualHome) {
    points += 2; // Correct Home Team Goals
  }
  if (predictedAway === actualAway) {
    points += 2; // Correct Away Team Goals
  }
  if (Math.abs(predictedGoalDifference) === Math.abs(actualGoalDifference)) {
    points += 1; // Correct Goal Difference (absolute value)
  }

  return points;
}

/**
 * Calculates all player statistics from predictions and games
 * Properly handles phase wins by comparing all players' scores per phase
 * 
 * @param {Array} games - Array of game objects with id, status, homeScore, awayScore, fecha
 * @param {Array} predictions - Array of prediction objects
 * @returns {Object} Object with userId keys mapping to player stats
 * 
 * Player stats include:
 * - totalPoints: Sum of all points across all games
 * - fechasWonCount: Number of phases won (where player had highest score vs others)
 * - perfectScoresCount: Number of 10-point predictions
 * - gamesParticipated: Number of games with predictions
 */
function calculatePlayerStats(games, predictions) {
  const playerStats = {}; // { userId: { totalPoints, fechasWonCount, perfectScoresCount, gamesParticipated } }
  const stageScores = {}; // { stageKey: { userId: totalScore } } - ALL players' scores per phase
  const gameMap = {}; // Create map for faster game lookup

  // Build game map - normalize to lowercase status and fields
  games.forEach(game => {
    gameMap[game.id] = game;
  });

  // Initialize player stats from predictions
  predictions.forEach(pred => {
    const userId = pred.userId || 'unknown';
    if (!playerStats[userId]) {
      playerStats[userId] = {
        totalPoints: 0,
        fechasWonCount: 0,
        perfectScoresCount: 0,
        gamesParticipated: 0
      };
    }
  });

  // Calculate points for each prediction and aggregate by fecha
  predictions.forEach(pred => {
    const userId = pred.userId || 'unknown';
    const game = gameMap[pred.gameId];

    if (game) {
      // Normalize game data to use lowercase 'status', 'homeScore', 'awayScore'
      const normalizedGame = {
        status: (game.Status || game.status || '').toLowerCase(),
        homeScore: game.HomeScore !== undefined ? game.HomeScore : game.homeScore,
        awayScore: game.AwayScore !== undefined ? game.AwayScore : game.awayScore
      };

      const points = calculatePoints(pred, normalizedGame);

      if (points !== null) {
        playerStats[userId].totalPoints += points;
        playerStats[userId].gamesParticipated += 1;

        // Track perfect scores
        if (points === 10) {
          playerStats[userId].perfectScoresCount += 1;
        }

        // Track fecha scores for all players
        const stageKey = game.StageKey || game.stageKey || buildStageKey({
          stage: game.Stage || game.stage,
          group: game.Group || game.group,
          matchday: game.Matchday || game.matchday
        });
        if (stageKey) {
          if (!stageScores[stageKey]) {
            stageScores[stageKey] = {};
          }
          if (!stageScores[stageKey][userId]) {
            stageScores[stageKey][userId] = 0;
          }
          stageScores[stageKey][userId] += points;
        }
      }
    }
  });

  // Calculate phase wins - where player had HIGHEST score in that phase
  Object.keys(stageScores).forEach(stageKey => {
    const playersInPhase = stageScores[stageKey];
    const scores = Object.values(playersInPhase);

    if (scores.length > 0) {
      const maxScore = Math.max(...scores);
      // All players tied for max score in a fecha get credited with a win
      Object.keys(playersInPhase).forEach(userId => {
        if (playersInPhase[userId] === maxScore) {
          playerStats[userId].fechasWonCount += 1;
        }
      });
    }
  });

  return playerStats;
}

/**
 * Gets stats for a specific player from pre-calculated player stats
 * Used for player history modals
 * 
 * @param {Object} playerStats - Pre-calculated player stats object from calculatePlayerStats
 * @param {string} userId - The userId to get stats for
 * @returns {Object} Stats object with totalPoints, perfectScoresCount, fechasWonCount
 */
function getPlayerStats(playerStats, userId) {
  if (!playerStats[userId]) {
    return {
      totalPoints: 0,
      perfectScoresCount: 0,
      fechasWonCount: 0
    };
  }
  return playerStats[userId];
}

/**
 * Aggregates prediction data organized by player and game for matrix display
 * 
 * @param {Array} games - Array of game objects
 * @param {Array} predictions - Array of prediction objects with playerName (for backward compat)
 * @returns {Object} Organized data: { players: [...], gameIds: [...], matrix: {...} }
 */
function aggregatePredictionsByPlayer(games, predictions) {
  const matrix = {}; // { playerId: { gameId: { points, prediction } } }
  const players = new Set();
  const gameIds = new Set();
  const gameMap = {};

  // Build game map
  games.forEach(game => {
    gameMap[game.id] = game;
    gameIds.add(game.id);
  });

  // Organize predictions
  predictions.forEach(pred => {
    const playerId = pred.userId || 'unknown';
    const game = gameMap[pred.gameId];

    if (game) {
      players.add(playerId);

      if (!matrix[playerId]) {
        matrix[playerId] = {};
      }

      const points = calculatePoints(pred, {
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore
      });

      matrix[playerId][pred.gameId] = {
        points,
        prediction: pred
      };
    }
  });

  return {
    players: Array.from(players).sort(),
    gameIds: Array.from(gameIds),
    matrix
  };
}

/**
 * Gets the latest display name for a user from predictions
 * Uses most recent prediction's playerName
 * 
 * @param {Array} predictions - Array of prediction objects
 * @param {string} userId - The userId to find display name for
 * @returns {string} Latest playerName or userId if not found
 */
function getLatestPlayerName(predictions, userId) {
  const userPredictions = predictions.filter(p => p.userId === userId);
  if (userPredictions.length > 0) {
    // Find most recent prediction
    let latest = userPredictions[0];
    userPredictions.forEach(pred => {
      const predTime = pred.timestamp ? new Date(pred.timestamp).getTime() : 0;
      const latestTime = latest.timestamp ? new Date(latest.timestamp).getTime() : 0;
      if (predTime > latestTime) {
        latest = pred;
      }
    });
    return latest.playerName || userId;
  }
  return userId;
}

/**
 * Sorts players by their statistics (for leaderboard)
 * 
 * @param {Object} playerStats - Player stats object from calculatePlayerStats
 * @param {Array} predictions - Array of predictions (to get display names)
 * @returns {Array} Array of [userId, stats] sorted by ranking
 */
function sortPlayersByStats(playerStats, predictions) {
  return Object.entries(playerStats)
    .sort(([idA, statsA], [idB, statsB]) => {
      // Primary: Total Points
      if (statsB.totalPoints !== statsA.totalPoints) {
        return statsB.totalPoints - statsA.totalPoints;
      }
      // Secondary: Phases Won
      if (statsB.fechasWonCount !== statsA.fechasWonCount) {
        return statsB.fechasWonCount - statsA.fechasWonCount;
      }
      // Tertiary: Perfect Scores
      if (statsB.perfectScoresCount !== statsA.perfectScoresCount) {
        return statsB.perfectScoresCount - statsA.perfectScoresCount;
      }
      // Quaternary: Alphabetical
      const nameA = getLatestPlayerName(predictions, idA);
      const nameB = getLatestPlayerName(predictions, idB);
      return nameA.localeCompare(nameB);
    });
}

/**
 * Gets score classification for UI coloring
 * 
 * @param {number} points - Points earned (0-10)
 * @returns {string} Classification: 'perfect', 'high', 'medium', 'low', 'zero', 'pending'
 */
function getScoreClass(points) {
  if (points === null || points === undefined) return 'pending';
  if (points === 10) return 'perfect';
  if (points >= 7) return 'high';
  if (points >= 4) return 'medium';
  if (points >= 1) return 'low';
  if (points === 0) return 'zero';
  return 'pending';
}

// ============================================
// DATA TRANSFORMATION HELPERS
// ============================================

/**
 * Transforms Firestore game data to standard format
 * Handles Firestore Timestamps and normalizes field names
 */
function normalizeGame(firestoreGame) {
  const kickOffTime = firestoreGame.KickOffTime?.toDate?.()
    ? firestoreGame.KickOffTime.toDate()
    : new Date(firestoreGame.KickOffTime);

  return {
    id: firestoreGame.id,
    homeTeam: firestoreGame.HomeTeam,
    awayTeam: firestoreGame.AwayTeam,
    homeScore: firestoreGame.HomeScore !== null ? firestoreGame.HomeScore : null,
    awayScore: firestoreGame.AwayScore !== null ? firestoreGame.AwayScore : null,
    status: firestoreGame.Status?.toLowerCase?.() || 'upcoming',
    kickOffTime: kickOffTime.toISOString(),
    stage: firestoreGame.Stage,
    group: firestoreGame.Group,
    matchday: firestoreGame.Matchday,
    stageKey: firestoreGame.StageKey,
    league: firestoreGame.League,
    // Keep original fields for backward compatibility
    HomeTeam: firestoreGame.HomeTeam,
    AwayTeam: firestoreGame.AwayTeam,
    HomeScore: firestoreGame.HomeScore,
    AwayScore: firestoreGame.AwayScore,
    Status: firestoreGame.Status,
    KickOffTime: firestoreGame.KickOffTime,
    Stage: firestoreGame.Stage,
    Group: firestoreGame.Group,
    Matchday: firestoreGame.Matchday,
    StageKey: firestoreGame.StageKey,
    League: firestoreGame.League
  };
}

/**
 * Transforms Firestore prediction data to standard format
 */
function normalizePrediction(firestorePrediction) {
  return {
    userId: firestorePrediction.userId,
    playerName: firestorePrediction.playerName,
    gameId: firestorePrediction.gameId,
    predictedHomeScore: firestorePrediction.predictedHomeScore,
    predictedAwayScore: firestorePrediction.predictedAwayScore,
    timestamp: firestorePrediction.timestamp?.toDate?.()
      ? firestorePrediction.timestamp.toDate()
      : new Date(firestorePrediction.timestamp)
  };
}

// Export functions for use in other modules (ES6 syntax)
export {
  calculatePoints,
  calculatePlayerStats,
  getPlayerStats,
  aggregatePredictionsByPlayer,
  getLatestPlayerName,
  sortPlayersByStats,
  getScoreClass,
  normalizeGame,
  normalizePrediction
};
