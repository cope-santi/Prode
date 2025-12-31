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
  if (providerName === "thesportsdb") {
    return mapSportsDbMatch(match, providerName);
  }
  return mapFootballDataMatch(match, providerName);
}

function mapFootballDataMatch(match, providerName) {
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

function mapSportsDbMatch(match, providerName) {
  const status = mapSportsDbStatus(match.strStatus);
  const legacyStatus = mapStatusToLegacy(status);
  const score = {
    home: parseScore(match.intHomeScore),
    away: parseScore(match.intAwayScore),
    fullTime: {
      home: parseScore(match.intHomeScore),
      away: parseScore(match.intAwayScore)
    },
    halfTime: {
      home: null,
      away: null
    }
  };

  const roundText = match.strRound || match.strEvent || "";
  const stage = mapRoundToStage(roundText);
  const group = extractGroup(match.strGroup || roundText);
  const matchday = parseMatchday(match.intRound, roundText);
  const stageKey = buildStageKey({ stage, group, matchday });
  const utcDate = parseSportsDbUtcDate(match);

  return {
    externalProvider: providerName,
    externalMatchId: String(match.idEvent || ""),
    utcDate,
    status,
    score,
    HomeTeam: match.strHomeTeam || "",
    AwayTeam: match.strAwayTeam || "",
    KickOffTime: utcDate,
    Status: legacyStatus,
    HomeScore: score.home,
    AwayScore: score.away,
    Stage: stage,
    Group: group,
    Matchday: matchday,
    StageKey: stageKey
  };
}

function mapSportsDbStatus(rawStatus) {
  const status = String(rawStatus || "").toLowerCase();
  if (status.includes("finished")) return "FINISHED";
  if (status.includes("half")) return "PAUSED";
  if (status.includes("in progress") || status.includes("live")) return "IN_PLAY";
  if (status.includes("not started") || status.includes("scheduled")) return "SCHEDULED";
  return "SCHEDULED";
}

function parseScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function mapRoundToStage(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("round of 32") || normalized.includes("last 32")) return "R32";
  if (normalized.includes("round of 16") || normalized.includes("last 16")) return "R16";
  if (normalized.includes("quarter")) return "QF";
  if (normalized.includes("semi")) return "SF";
  if (normalized.includes("third")) return "3P";
  if (normalized.includes("final")) return "FINAL";
  if (normalized.includes("group")) return "GROUP";
  return null;
}

function extractGroup(value) {
  const text = String(value || "");
  const match = text.match(/group\s*([a-z])/i);
  if (match) return match[1].toUpperCase();
  if (text.length === 1) return text.toUpperCase();
  return null;
}

function parseMatchday(intRound, roundText) {
  const roundNum = parseInt(intRound, 10);
  if (!Number.isNaN(roundNum) && roundNum > 0) {
    return roundNum;
  }
  const match = String(roundText || "").match(/(\d+)/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function parseSportsDbUtcDate(match) {
  const timestamp = match.strTimestamp;
  const dateEvent = match.dateEvent;
  const timeEvent = match.strTime;

  if (timestamp) {
    return toIso(timestamp);
  }

  if (dateEvent && timeEvent) {
    return toIso(`${dateEvent} ${timeEvent}`);
  }

  if (dateEvent) {
    return `${dateEvent}T00:00:00Z`;
  }

  return null;
}

function toIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withZone = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
  const parsed = Date.parse(withZone);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
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
