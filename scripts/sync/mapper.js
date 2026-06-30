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

function mapEventToGame(event) {
  const providerStatus = mapSportsDbStatus(event.strStatus);
  const status = providerStatus === "FINISHED" ? "finished" : "upcoming";
  const score = status === "finished" ? buildScore(event) : null;
  const advancingTeam = status === "finished" ? extractAdvancingTeam(event) : null;
  const roundText = event.strRound || event.strEvent;
  let stage = mapRoundToStage(roundText, event.intRound);
  const rawGroup = extractGroup(event.strGroup || roundText);
  if (!stage && rawGroup) {
    stage = "GROUP";
  }
  const group = stage === "GROUP" ? rawGroup : null;
  const matchday = parseMatchday(stage, event.intRound, roundText);
  const stageKey = buildStageKey({ stage, group, matchday });
  const utcDate = parseSportsDbUtcDate(event);

  return {
    externalProvider: "thesportsdb",
    externalMatchId: event.idEvent ? String(event.idEvent) : "",
    utcDate,
    status,
    providerStatus,
    score,
    HomeTeam: event.strHomeTeam || "",
    AwayTeam: event.strAwayTeam || "",
    KickOffTime: utcDate,
    HomeScore: score ? score.home : null,
    AwayScore: score ? score.away : null,
    advancingTeam,
    Stage: stage,
    Group: group,
    Matchday: matchday,
    StageKey: stageKey
  };
}

function mapSportsDbStatus(rawStatus) {
  const status = String(rawStatus || "").toLowerCase();
  if (
    status.includes("finished") ||
    status.includes("after extra time") ||
    status.includes("after penalty") ||
    status === "ft" ||
    status === "aet" ||
    status === "pen" ||
    status === "ap"
  ) {
    return "FINISHED";
  }
  return "SCHEDULED";
}

function buildScore(event) {
  return {
    home: parseScore(event.intHomeScore),
    away: parseScore(event.intAwayScore),
    fullTime: {
      home: parseScore(event.intHomeScore),
      away: parseScore(event.intAwayScore)
    },
    halfTime: {
      home: null,
      away: null
    }
  };
}

function parseScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractAdvancingTeam(event) {
  const homeScore = parseScore(event.intHomeScore);
  const awayScore = parseScore(event.intAwayScore);
  if (homeScore !== null && awayScore !== null && homeScore !== awayScore) {
    return homeScore > awayScore ? "home" : "away";
  }

  const status = String(event.strStatus || "").trim().toLowerCase();
  const result = String(event.strResult || "").trim().toLowerCase();
  const isPenaltyResult = status === "ap" || status === "pen" || result.includes("penalt");
  const homeExtra = parseScore(event.intHomeScoreExtra);
  const awayExtra = parseScore(event.intAwayScoreExtra);
  if (isPenaltyResult && homeExtra !== null && awayExtra !== null && homeExtra !== awayExtra) {
    return homeExtra > awayExtra ? "home" : "away";
  }

  const homeTeam = normalizeResultTeam(event.strHomeTeam);
  const awayTeam = normalizeResultTeam(event.strAwayTeam);
  const normalizedResult = normalizeResultTeam(result);
  if (teamWonResult(normalizedResult, homeTeam)) return "home";
  if (teamWonResult(normalizedResult, awayTeam)) return "away";

  return null;
}

function teamWonResult(result, team) {
  if (!result || !team) return false;
  return (
    result.startsWith(`${team} win`) ||
    result.startsWith(`${team} wins`) ||
    result.startsWith(`${team} won`) ||
    result.startsWith(`${team} advance`) ||
    result.startsWith(`${team} advanced`)
  );
}

function normalizeResultTeam(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapRoundToStage(text, roundNumber) {
  const roundNum = parseInt(roundNumber, 10);
  if (!Number.isNaN(roundNum)) {
    if (roundNum >= 1 && roundNum <= 3) return "GROUP";
    if (roundNum === 32) return "R32";
    if (roundNum === 16) return "R16";
    if (roundNum === 8 || roundNum === 125) return "QF";
    if (roundNum === 4 || roundNum === 150) return "SF";
    if (roundNum === 160) return "3P";
    if (roundNum === 200) return "FINAL";
  }

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
  if (match) return normalizeGroup(match[1]);
  if (text.length === 1) return normalizeGroup(text);
  return null;
}

function parseMatchday(stage, intRound, roundText) {
  if (stage !== "GROUP") return null;
  const roundNum = parseInt(intRound, 10);
  if (!Number.isNaN(roundNum) && roundNum >= 1 && roundNum <= 3) {
    return roundNum;
  }
  const match = String(roundText || "").match(/\b(?:matchday|round)\s*(?:day\s*)?([1-3])\b/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (Number.isNaN(parsed)) return null;
    return parsed >= 1 && parsed <= 3 ? parsed : null;
  }
  return null;
}

function normalizeGroup(value) {
  const group = String(value || "").trim().toUpperCase();
  return /^[A-L]$/.test(group) ? group : null;
}

function buildStageKey({ stage, group, matchday }) {
  if (!stage) return null;
  if (stage === "GROUP") {
    if (!group || !matchday) return null;
    return `GROUP-${group}-MD${matchday}`;
  }
  return stage;
}

function parseSportsDbUtcDate(event) {
  const timestamp = event.strTimestamp;
  const dateEvent = event.dateEvent;
  const timeEvent = event.strTime;

  if (timestamp) {
    return toIso(timestamp);
  }

  if (dateEvent && timeEvent) {
    const time = String(timeEvent).trim();
    const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(time);
    const raw = hasZone ? `${dateEvent}T${time}` : `${dateEvent}T${time}Z`;
    return toIso(raw);
  }

  if (dateEvent) {
    return `${dateEvent}T00:00:00Z`;
  }

  return null;
}

function toIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

module.exports = {
  mapEventToGame,
  mapSportsDbStatus,
  parseSportsDbUtcDate,
  buildStageKey
};
