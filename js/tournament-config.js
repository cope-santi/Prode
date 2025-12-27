export const TOURNAMENT_CONFIG = {
    tournamentId: 'FIFA2026',
    displayName: 'FIFA World Cup 2026',
    stages: [
        { id: 'GROUP', label: 'Group Stage', requiresGroup: true, requiresMatchday: true },
        { id: 'R32', label: 'Round of 32', requiresGroup: false, requiresMatchday: false },
        { id: 'R16', label: 'Round of 16', requiresGroup: false, requiresMatchday: false },
        { id: 'QF', label: 'Quarterfinals', requiresGroup: false, requiresMatchday: false },
        { id: 'SF', label: 'Semifinals', requiresGroup: false, requiresMatchday: false },
        { id: '3P', label: 'Third Place', requiresGroup: false, requiresMatchday: false },
        { id: 'FINAL', label: 'Final', requiresGroup: false, requiresMatchday: false }
    ],
    groups: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
    matchdays: [1, 2, 3]
};

const stageLabelMap = new Map(TOURNAMENT_CONFIG.stages.map(stage => [stage.id, stage.label]));

export function isGroupStage(stageId) {
    return stageId === 'GROUP';
}

export function buildStageKey({ stage, group, matchday }) {
    if (!stage) return null;
    if (isGroupStage(stage)) {
        if (!group || !matchday) return null;
        return `GROUP-${group}-MD${matchday}`;
    }
    return stage;
}

export function getStageLabel(stageId) {
    return stageLabelMap.get(stageId) || stageId;
}

export function getStageDisplayLabel({ stage, group, matchday }) {
    if (!stage) return 'TBD';
    if (isGroupStage(stage)) {
        if (!group || !matchday) return 'Group Stage';
        return `Group ${group} - Matchday ${matchday}`;
    }
    return getStageLabel(stage);
}

export function parseStageKey(stageKey) {
    if (!stageKey) return null;
    if (stageKey.startsWith('GROUP-')) {
        const [, group, matchdayPart] = stageKey.split('-');
        const matchday = matchdayPart?.replace('MD', '');
        return { stage: 'GROUP', group, matchday: matchday ? Number(matchday) : null };
    }
    return { stage: stageKey };
}

export function resolveStageKey(game) {
    return (
        game.StageKey ||
        game.stageKey ||
        buildStageKey({
            stage: game.Stage || game.stage,
            group: game.Group || game.group,
            matchday: game.Matchday || game.matchday
        })
    );
}

export function resolveStageLabel(game) {
    const stageKey = resolveStageKey(game);
    const parsed = parseStageKey(stageKey);
    if (!parsed) return 'TBD';
    return getStageDisplayLabel(parsed);
}

export function sortStageKeys(stageKeys) {
    const stageOrder = TOURNAMENT_CONFIG.stages.map(stage => stage.id);

    return [...stageKeys].sort((a, b) => {
        const parsedA = parseStageKey(a) || {};
        const parsedB = parseStageKey(b) || {};
        const stageIndexA = stageOrder.indexOf(parsedA.stage);
        const stageIndexB = stageOrder.indexOf(parsedB.stage);
        if (stageIndexA !== stageIndexB) {
            return stageIndexA - stageIndexB;
        }
        if (parsedA.stage === 'GROUP' && parsedB.stage === 'GROUP') {
            const groupCompare = (parsedA.group || '').localeCompare(parsedB.group || '');
            if (groupCompare !== 0) return groupCompare;
            return (parsedA.matchday || 0) - (parsedB.matchday || 0);
        }
        return 0;
    });
}
