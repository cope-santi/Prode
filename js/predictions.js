/**
 * Shared prediction helpers
 *
 * Phase-unlock logic, canonical status normalization and the display-name
 * resolver, shared between the landing (index.html) and the prediction hub
 * (fixtures.html) so the rules stay in one place.
 */

import { resolveStageKey, resolveStageLabel } from './tournament-config.js';

export const STAGE_ORDER = ['GROUP', 'R32', 'R16', 'QF', 'SF', '3P', 'FINAL'];

export const STAGE_PREREQ = {
    R32: 'GROUP',
    R16: 'R32',
    QF: 'R16',
    SF: 'QF',
    '3P': 'SF',
    FINAL: 'SF'
};

/** Canonical status: always one of 'upcoming' | 'live' | 'finished'. */
export function getGameStatus(game) {
    const normalized = String(game.status || game.Status || 'upcoming').toLowerCase();
    if (normalized === 'scheduled') return 'upcoming';
    if (normalized === 'in_play') return 'live';
    return normalized;
}

/** Top-level stage id for a game ('GROUP', 'R16', ...). */
export function getStageIdFromGame(game) {
    const stageKey = resolveStageKey(game);
    if (stageKey) {
        return stageKey.startsWith('GROUP-') ? 'GROUP' : stageKey;
    }
    return game.Stage || game.stage || null;
}

export function buildStageState(games) {
    const state = {};
    STAGE_ORDER.forEach(stage => {
        state[stage] = { hasGames: false, allFinished: true };
    });

    games.forEach(game => {
        const stageId = getStageIdFromGame(game);
        if (!stageId || !state[stageId]) return;
        state[stageId].hasGames = true;
        if (getGameStatus(game) !== 'finished') {
            state[stageId].allFinished = false;
        }
    });

    STAGE_ORDER.forEach(stage => {
        if (!state[stage].hasGames) {
            state[stage].allFinished = false;
        }
    });

    return state;
}

export function buildStageUnlocks(stageState) {
    return {
        GROUP: true,
        R32: stageState.GROUP.allFinished,
        R16: stageState.R32.allFinished,
        QF: stageState.R16.allFinished,
        SF: stageState.QF.allFinished,
        '3P': stageState.SF.allFinished,
        FINAL: stageState.SF.allFinished
    };
}

export function getLockMessage(stageId) {
    const prereq = STAGE_PREREQ[stageId];
    if (!prereq) return 'Bloqueado hasta que finalice la fase anterior.';
    const label = resolveStageLabel({ StageKey: prereq });
    return `Bloqueado hasta que finalice ${label}.`;
}

/** Whether a game's kick-off time is already in the past. */
export function hasKickedOff(game) {
    const raw = game.KickOffTime && game.KickOffTime.toDate ? game.KickOffTime.toDate() : game.KickOffTime;
    const millis = raw ? new Date(raw).getTime() : NaN;
    return !Number.isNaN(millis) && millis <= Date.now();
}

/** Single source of truth for the player's display name. */
export function resolveDisplayName(user) {
    if (!user) return '';
    const name = (user.displayName || '').trim();
    return name || (user.email ? user.email.split('@')[0] : 'Jugador');
}
