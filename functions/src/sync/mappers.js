const STAGE_MAP = {
  GROUP_STAGE: "GROUP",
  LAST_32: "R32",
  LAST_16: "R16",
  ROUND_OF_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  THIRD_PLACE: "3P",
  FINAL: "FINAL"
};

function normalizeGroup(group) {
  if (!group) return null;
  if (group.startsWith("GROUP_")) {
    return group.replace("GROUP_", "");
  }
  return group;
}

function buildStageKey({ stage, group, matchday }) {
  if (!stage) return null;
  if (stage === "GROUP") {
    if (!group || !matchday) return null;
    return `GROUP-${group}-MD${matchday}`;
  }
  return stage;
}

function mapStatusToLegacy(status) {
  const normalized = (status || "").toUpperCase();
  if (normalized === "FINISHED") return "finished";
  if (normalized === "IN_PLAY" || normalized === "PAUSED") return "live";
  return "upcoming";
}

function pickScore(match) {
  const score = match.score || {};
  const fullTime = score.fullTime || {};
  const halfTime = score.halfTime || {};
  const regularTime = score.regularTime || {};
  const extraTime = score.extraTime || {};
  const penalties = score.penalties || {};

  const home =
    fullTime.home ?? regularTime.home ?? extraTime.home ?? penalties.home ?? halfTime.home ?? null;
  const away =
    fullTime.away ?? regularTime.away ?? extraTime.away ?? penalties.away ?? halfTime.away ?? null;

  return {
    home,
    away,
    fullTime: {
      home: fullTime.home ?? null,
      away: fullTime.away ?? null
    },
    halfTime: {
      home: halfTime.home ?? null,
      away: halfTime.away ?? null
    }
  };
}

function mapMatchToGame(match, providerName) {
  const stage = STAGE_MAP[match.stage] || null;
  const group = normalizeGroup(match.group);
  const matchday = match.matchday || null;
  const stageKey = buildStageKey({ stage, group, matchday });
  const status = match.status || "SCHEDULED";
  const legacyStatus = mapStatusToLegacy(status);
  const score = pickScore(match);

  return {
    externalProvider: providerName,
    externalMatchId: String(match.id),
    utcDate: match.utcDate || null,
    status,
    score,
    HomeTeam: match.homeTeam?.name || "",
    AwayTeam: match.awayTeam?.name || "",
    KickOffTime: match.utcDate || null,
    Status: legacyStatus,
    HomeScore: score.home,
    AwayScore: score.away,
    Stage: stage,
    Group: group,
    Matchday: matchday,
    StageKey: stageKey
  };
}

function buildMatchKey({ homeTeam, awayTeam, utcDate }) {
  if (!homeTeam || !awayTeam || !utcDate) return null;
  const parsed = Date.parse(utcDate);
  if (Number.isNaN(parsed)) return null;
  return `${normalizeTeamName(homeTeam)}|${normalizeTeamName(awayTeam)}|${new Date(parsed).toISOString()}`;
}

function normalizeTeamName(name) {
  return String(name || "").trim().toLowerCase();
}

module.exports = {
  mapMatchToGame,
  buildMatchKey,
  mapStatusToLegacy
};
