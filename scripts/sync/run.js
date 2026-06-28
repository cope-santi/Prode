const admin = require("firebase-admin");
const { setTimeout: delay } = require("node:timers/promises");
const { mapEventToGame } = require("./mapper");
const countries = require("i18n-iso-countries");

countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

const SPECIAL_FLAG_CODES = {
  "england": "gb-eng",
  "scotland": "gb-sct",
  "wales": "gb-wls",
  "northern ireland": "gb-nir",
  "usa": "us",
  "u.s.a.": "us",
  "united states": "us",
  "united states of america": "us",
  "korea republic": "kr",
  "south korea": "kr",
  "korea, south": "kr",
  "korea dpr": "kp",
  "north korea": "kp",
  "ivory coast": "ci",
  "cote d'ivoire": "ci",
  "cote d ivoire": "ci",
  "czech republic": "cz",
  "czechia": "cz",
  "russia": "ru",
  "uae": "ae",
  "united arab emirates": "ae"
};

const NAME_ALIASES = {
  "iran": "Iran, Islamic Republic of",
  "venezuela": "Venezuela, Bolivarian Republic of",
  "bolivia": "Bolivia, Plurinational State of",
  "moldova": "Moldova, Republic of",
  "brunei": "Brunei Darussalam",
  "laos": "Lao People's Democratic Republic",
  "vietnam": "Viet Nam",
  "russia": "Russian Federation",
  "syria": "Syrian Arab Republic",
  "cape verde": "Cabo Verde",
  "swaziland": "Eswatini",
  "tanzania": "Tanzania, United Republic of"
};

const CACHE = new Map();

async function run() {
  const config = loadConfig();
  const db = initFirebase(config);

  const lockId = `${process.env.GITHUB_RUN_ID || "local"}-${process.pid}-${Date.now()}`;
  const lockAcquired = await acquireLock(db, config, lockId);
  if (!lockAcquired) {
    console.log("Sync already running. Exiting.");
    return;
  }

  const now = admin.firestore.Timestamp.now();
  try {
    let events = await loadEvents(config);

    const snapshot = await db
      .collection("games")
      .where("tournamentId", "==", config.tournamentId)
      .get();

    const byExternal = new Map();
    const byMatchKey = new Map();
    const existingGames = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      existingGames.push({ id: doc.id, ...data });
      if (data.externalProvider && data.externalMatchId) {
        byExternal.set(`${data.externalProvider}:${data.externalMatchId}`, doc);
      }
      const matchKey = buildMatchKey(data.HomeTeam, data.AwayTeam, data.utcDate || data.KickOffTime);
      if (matchKey) {
        byMatchKey.set(matchKey, doc);
      }
    });

    events = await enrichEventsWithDirectLookups(config, events, existingGames, now);

    const maxBatchSize = 450;
    let batch = db.batch();
    let batchCount = 0;
    let writeCount = 0;
    let created = 0;
    let updated = 0;
    let skippedManual = 0;
    let skippedUnchanged = 0;

    for (const event of events) {
      const mapped = mapEventToGame(event);
      if (!mapped.externalMatchId) continue;

      const externalKey = `thesportsdb:${mapped.externalMatchId}`;
      const matchKey = buildMatchKey(mapped.HomeTeam, mapped.AwayTeam, mapped.utcDate);
      const existingDoc = byExternal.get(externalKey) || (matchKey ? byMatchKey.get(matchKey) : null);

      if (existingDoc) {
        const existingData = existingDoc.data();
        if (existingData.isManuallyEdited) {
          skippedManual += 1;
          continue;
        }

        const updatePayload = buildPayload(mapped, config, now, false);
        const sanitized = sanitizePayload(updatePayload, existingData);
        if (!hasChanges(sanitized, existingData)) {
          skippedUnchanged += 1;
          continue;
        }

        batch.set(existingDoc.ref, sanitized, { merge: true });
        writeCount += 1;
        updated += 1;
        batchCount += 1;

        if (batchCount >= maxBatchSize) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
        continue;
      }

      const docId = `thesportsdb_${mapped.externalMatchId}`;
      const docRef = db.collection("games").doc(docId);
      const createPayload = buildPayload(mapped, config, now, true);
      const sanitizedCreate = sanitizePayload(createPayload, {});
      batch.set(docRef, sanitizedCreate, { merge: true });
      writeCount += 1;
      created += 1;
      batchCount += 1;

      if (batchCount >= maxBatchSize) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (writeCount > 0 && batchCount > 0) {
      await batch.commit();
    }

    const teamLogoStats = config.syncTeamLogos
      ? await syncTeamLogos(db, config, events)
      : { updated: 0, skipped: 0, missing: 0, total: 0 };

    const publicCachePlan = await getPublicCachePlan(db, config, existingGames, now, writeCount);
    const publicCacheStats = publicCachePlan.full
      ? await updatePublicCache(db, config, now)
      : publicCachePlan.startedGames.length > 0
      ? await updateStartedPublicResults(db, config, now, publicCachePlan.startedGames)
      : { leaderboardPlayers: 0, resultGames: 0, skipped: true };

    await updateSyncStatus(db, config.tournamentId, {
      lastRunAt: now,
      lastSuccessAt: now,
      syncStatus: "ok",
      syncError: null,
      provider: "thesportsdb",
      updated,
      created,
      skippedManual,
      skippedUnchanged,
      totalEvents: events.length,
      teamLogoUpdated: teamLogoStats.updated,
      teamLogoSkipped: teamLogoStats.skipped,
      teamLogoMissing: teamLogoStats.missing,
      teamLogoTotal: teamLogoStats.total,
      publicCachePlayers: publicCacheStats.leaderboardPlayers,
      publicCacheResultGames: publicCacheStats.resultGames,
      publicCacheSkipped: !!publicCacheStats.skipped
    });

    console.log(
      `Sync summary: totalEvents=${events.length}, created=${created}, updated=${updated}, ` +
      `skippedManual=${skippedManual}, skippedUnchanged=${skippedUnchanged}, ` +
      `teamLogoUpdated=${teamLogoStats.updated}, teamLogoSkipped=${teamLogoStats.skipped}, ` +
      `teamLogoMissing=${teamLogoStats.missing}, publicCachePlayers=${publicCacheStats.leaderboardPlayers}, ` +
      `publicCacheResultGames=${publicCacheStats.resultGames}, publicCacheSkipped=${!!publicCacheStats.skipped}`
    );
  } catch (error) {
    const syncStatus = error.code === "rate_limit" ? "rate_limit" : "error";
    await updateSyncStatus(db, config.tournamentId, {
      lastRunAt: now,
      syncStatus,
      syncError: error.message || String(error),
      provider: "thesportsdb"
    });
    throw error;
  } finally {
    await releaseLock(db, config.tournamentId, lockId);
  }
}

function loadConfig() {
  const required = [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_PROJECT_ID",
    "THESPORTSDB_API_KEY",
    "THESPORTSDB_LEAGUE_ID",
    "TOURNAMENT_ID"
  ];
  required.forEach(key => {
    if (!process.env[key]) {
      throw new Error(`Missing env var: ${key}`);
    }
  });

  return {
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    apiKey: process.env.THESPORTSDB_API_KEY,
    leagueId: process.env.THESPORTSDB_LEAGUE_ID,
    season: process.env.THESPORTSDB_SEASON || "",
    rounds: parseRounds(process.env.THESPORTSDB_ROUNDS),
    tournamentId: process.env.TOURNAMENT_ID,
    lookbackDays: parseInt(process.env.LOOKBACK_DAYS || "2", 10),
    cacheTtlMs: parseInt(process.env.PROVIDER_CACHE_TTL_MS || "20000", 10),
    lockMinutes: parseInt(process.env.POST_MATCH_SYNC_MINUTES || "10", 10),
    syncTeamLogos: parseBoolean(process.env.SYNC_TEAM_LOGOS, true),
    forceTeamLogos: parseBoolean(process.env.FORCE_TEAM_LOGOS, false),
    flagBaseUrl: process.env.FLAG_BASE_URL || "https://flagcdn.com",
    flagSize: process.env.FLAG_SIZE || "w80",
    flagFormat: process.env.FLAG_FORMAT || "png"
  };
}

function initFirebase(config) {
  const serviceAccount = JSON.parse(config.serviceAccountJson);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: config.firebaseProjectId
    });
  }

  return admin.firestore();
}

async function fetchEvents(config, endpoint, cacheKey) {
  const baseUrl = "https://www.thesportsdb.com/api/v1/json";
  const url = `${baseUrl}/${config.apiKey}/${endpoint}?id=${config.leagueId}`;
  return fetchWithCache(url, cacheKey, config.cacheTtlMs);
}

async function fetchSeasonEvents(config) {
  const baseUrl = "https://www.thesportsdb.com/api/v1/json";
  const season = String(config.season || "").trim();
  const url = `${baseUrl}/${config.apiKey}/eventsseason.php?id=${config.leagueId}&s=${encodeURIComponent(season)}`;
  return fetchWithCache(url, "season", config.cacheTtlMs);
}

async function fetchRoundEvents(config, round) {
  const baseUrl = "https://www.thesportsdb.com/api/v1/json";
  const season = String(config.season || "").trim();
  const roundParam = String(round || "").trim();
  const url = `${baseUrl}/${config.apiKey}/eventsround.php?id=${config.leagueId}&s=${encodeURIComponent(season)}&r=${encodeURIComponent(roundParam)}`;
  return fetchWithCache(url, `round_${roundParam}`, config.cacheTtlMs);
}

async function fetchEventById(config, eventId) {
  const baseUrl = "https://www.thesportsdb.com/api/v1/json";
  const id = String(eventId || "").trim();
  const url = `${baseUrl}/${config.apiKey}/lookupevent.php?id=${encodeURIComponent(id)}`;
  return fetchWithCache(url, `event_${id}`, config.cacheTtlMs);
}

async function loadEvents(config) {
  if (Array.isArray(config.rounds) && config.rounds.length > 0) {
    if (!config.season) {
      console.warn("THESPORTSDB_SEASON is required when using THESPORTSDB_ROUNDS.");
    }
    const roundEvents = [];
    for (const round of config.rounds) {
      const events = await fetchRoundEvents(config, round);
      roundEvents.push(...events);
    }
    return mergeEvents(roundEvents, []);
  }

  if (config.season) {
    const seasonEvents = await fetchSeasonEvents(config);
    if (seasonEvents.length > 0) {
      return seasonEvents;
    }
    console.warn("No season events returned. Falling back to past/next endpoints.");
  }

  const pastEvents = await fetchEvents(config, "eventspastleague.php", "past");
  const nextEvents = await fetchEvents(config, "eventsnextleague.php", "next");
  const filteredPast = filterPastEvents(pastEvents, config.lookbackDays);
  return mergeEvents(filteredPast, nextEvents);
}

function parseRounds(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function normalizeTeamName(name) {
  return String(name || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildTeamDocId(name) {
  return normalizeTeamName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function resolveFlagCode(teamName) {
  const normalized = normalizeTeamName(teamName);
  if (!normalized) return null;
  if (SPECIAL_FLAG_CODES[normalized]) {
    return SPECIAL_FLAG_CODES[normalized];
  }
  const aliasName = NAME_ALIASES[normalized];
  let code = aliasName ? countries.getAlpha2Code(aliasName, "en") : null;
  if (!code) {
    code = countries.getAlpha2Code(teamName, "en");
  }
  if (!code) {
    code = countries.getAlpha2Code(normalized, "en");
  }
  return code ? code.toLowerCase() : null;
}

function buildFlagUrl(config, flagCode) {
  return `${config.flagBaseUrl}/${config.flagSize}/${flagCode}.${config.flagFormat}`;
}

function extractTeamsFromEvents(events) {
  const names = new Set();
  (events || []).forEach(event => {
    if (event.strHomeTeam) names.add(event.strHomeTeam);
    if (event.strAwayTeam) names.add(event.strAwayTeam);
  });
  return Array.from(names).sort();
}

async function loadExistingTeams(db) {
  const snapshot = await db.collection("teams").get();
  const map = new Map();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data || !data.name) return;
    map.set(normalizeTeamName(data.name), { ref: doc.ref, data });
  });
  return map;
}

async function syncTeamLogos(db, config, events) {
  const teamNames = extractTeamsFromEvents(events);
  const existingTeams = await loadExistingTeams(db);

  const stats = { updated: 0, skipped: 0, missing: 0, total: teamNames.length };
  const maxBatchSize = 450;
  let batch = db.batch();
  let batchCount = 0;
  const syncedAt = admin.firestore.Timestamp.now();

  for (const teamName of teamNames) {
    const normalized = normalizeTeamName(teamName);
    const existing = existingTeams.get(normalized);
    const existingLogo = existing?.data?.logoUrl;
    const existingSource = existing?.data?.logoSource;

    if (existingLogo && !config.forceTeamLogos) {
      if (existingSource === "flagcdn") {
        stats.skipped += 1;
        continue;
      }
      if (!existingSource) {
        stats.skipped += 1;
        continue;
      }
      if (existingSource !== "thesportsdb") {
        stats.skipped += 1;
        continue;
      }
    }

    const flagCode = resolveFlagCode(teamName);
    if (!flagCode) {
      stats.missing += 1;
      continue;
    }

    const logoUrl = buildFlagUrl(config, flagCode);
    const docRef = existing?.ref || db.collection("teams").doc(buildTeamDocId(teamName));
    const payload = {
      name: teamName,
      logoUrl,
      logoSource: "flagcdn",
      logoType: "flag",
      flagCode,
      lastSyncedAt: syncedAt
    };

    batch.set(docRef, payload, { merge: true });
    batchCount += 1;
    stats.updated += 1;

    if (batchCount >= maxBatchSize) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return stats;
}

async function fetchWithCache(url, cacheKey, cacheTtlMs) {
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && now - cached.at < cacheTtlMs) {
    return cached.data;
  }

  const response = await fetchWithRetry(url);
  if (response.status === 429) {
    const error = new Error("TheSportsDB rate limit reached.");
    error.code = "rate_limit";
    throw error;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TheSportsDB error ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const data = Array.isArray(payload.events) ? payload.events : [];
  CACHE.set(cacheKey, { at: now, data });
  return data;
}

async function fetchWithRetry(url, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) return response;
    if (!response.ok && response.status >= 500 && attempt < 2) {
      await delay(500 * Math.pow(2, attempt));
      return fetchWithRetry(url, attempt + 1);
    }
    return response;
  } catch (error) {
    if (attempt >= 2) throw error;
    await delay(500 * Math.pow(2, attempt));
    return fetchWithRetry(url, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

function filterPastEvents(events, lookbackDays) {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - lookbackDays);
  const fromDate = from.toISOString().slice(0, 10);

  return (events || []).filter(event => {
    if (!event.dateEvent) return true;
    return event.dateEvent >= fromDate;
  });
}

function mergeEvents(pastEvents, nextEvents) {
  const byId = new Map();
  [...(pastEvents || []), ...(nextEvents || [])].forEach(event => {
    if (event && event.idEvent) {
      byId.set(String(event.idEvent), event);
    }
  });
  return Array.from(byId.values());
}

function buildPayload(mapped, config, now, isCreate) {
  const payload = {
    externalProvider: "thesportsdb",
    externalMatchId: mapped.externalMatchId,
    utcDate: mapped.utcDate,
    status: mapped.status,
    providerStatus: mapped.providerStatus,
    HomeTeam: mapped.HomeTeam,
    AwayTeam: mapped.AwayTeam,
    KickOffTime: mapped.utcDate,
    Stage: mapped.Stage,
    Group: mapped.Group,
    Matchday: mapped.Matchday,
    StageKey: mapped.StageKey,
    tournamentId: config.tournamentId,
    lastSyncedAt: now,
    syncStatus: "ok",
    syncError: null
  };

  if (mapped.status === "finished") {
    payload.score = mapped.score;
    payload.HomeScore = mapped.HomeScore;
    payload.AwayScore = mapped.AwayScore;
    payload.advancingTeam = getActualAdvancingTeam(payload);
  } else {
    payload.score = null;
    payload.HomeScore = null;
    payload.AwayScore = null;
    payload.advancingTeam = null;
  }

  if (isCreate) {
    payload.isManuallyEdited = false;
  } else {
    payload.Status = admin.firestore.FieldValue.delete();
  }

  return payload;
}

function sanitizePayload(payload, existingData) {
  const sanitized = { ...payload };
  const existingStatus = String(existingData.status || existingData.Status || "").toLowerCase();
  const hasLegacyStatus = Object.prototype.hasOwnProperty.call(existingData, "Status");

  if (existingStatus === "finished" && sanitized.status !== "finished") {
    sanitized.status = "finished";
    sanitized.providerStatus = existingData.providerStatus || "FINISHED";
    sanitized.Status = admin.firestore.FieldValue.delete();
  }

  if (sanitized.status !== "finished") {
    sanitized.score = null;
    sanitized.HomeScore = null;
    sanitized.AwayScore = null;
    sanitized.advancingTeam = null;
  }

  if (!hasLegacyStatus) {
    delete sanitized.Status;
  }

  return sanitized;
}

async function enrichEventsWithDirectLookups(config, events, existingGames, syncedAt) {
  const ids = Array.from(new Set(
    (existingGames || [])
      .filter(game => needsDirectEventRefresh(game, syncedAt, config.lookbackDays))
      .map(game => String(game.externalMatchId || "").trim())
      .filter(Boolean)
  ));

  if (ids.length === 0) {
    return events;
  }

  const directEvents = [];
  for (const id of ids) {
    try {
      const matches = await fetchEventById(config, id);
      directEvents.push(...matches);
    } catch (error) {
      console.warn(`Direct event refresh failed for ${id}: ${error.message || error}`);
    }
  }

  console.log(`Direct event refresh: attempted=${ids.length}, returned=${directEvents.length}`);
  return mergeEvents(events, directEvents);
}

function needsDirectEventRefresh(game, syncedAt, lookbackDays) {
  if (!game || game.externalProvider !== "thesportsdb" || !game.externalMatchId) {
    return false;
  }
  if (normalizeGameStatusForScoring(game) === "finished") {
    return false;
  }

  const kickoffMs = toMillis(game.KickOffTime || game.utcDate);
  const syncedMs = syncedAt?.toMillis ? syncedAt.toMillis() : toMillis(syncedAt);
  if (!kickoffMs || !syncedMs || kickoffMs > syncedMs) {
    return false;
  }

  const refreshWindowDays = Math.max(Number(lookbackDays) || 2, 2) + 2;
  return kickoffMs >= syncedMs - refreshWindowDays * 24 * 60 * 60 * 1000;
}

function hasChanges(payload, existingData) {
  const fields = [
    "HomeTeam",
    "AwayTeam",
    "KickOffTime",
    "utcDate",
    "Status",
    "status",
    "providerStatus",
    "HomeScore",
    "AwayScore",
    "Stage",
    "Group",
    "Matchday",
    "StageKey",
    "externalProvider",
    "externalMatchId",
    "score",
    "advancingTeam"
  ];

  return fields.some(field => {
    if (!(field in payload)) return false;
    const nextValue = normalizeValue(payload[field]);
    const currentValue = normalizeValue(existingData[field]);
    return nextValue !== currentValue;
  });
}

function normalizeValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function buildMatchKey(homeTeam, awayTeam, utcDate) {
  if (!homeTeam || !awayTeam || !utcDate) return null;
  const parsed = Date.parse(utcDate);
  if (Number.isNaN(parsed)) return null;
  return `${normalizeTeam(homeTeam)}|${normalizeTeam(awayTeam)}|${new Date(parsed).toISOString()}`;
}

function normalizeTeam(name) {
  return String(name || "").trim().toLowerCase();
}

async function acquireLock(db, config, lockId) {
  const lockRef = db.collection("sync_locks").doc(config.tournamentId);
  const now = Date.now();
  const ttlMs = Math.max(1, config.lockMinutes) * 60 * 1000;
  const expiresAt = admin.firestore.Timestamp.fromMillis(now + ttlMs);
  let acquired = false;

  await db.runTransaction(async tx => {
    const snap = await tx.get(lockRef);
    if (snap.exists) {
      const data = snap.data();
      if (data.expiresAt && data.expiresAt.toMillis() > now) {
        return;
      }
    }
    tx.set(
      lockRef,
      {
        lockedAt: admin.firestore.Timestamp.fromMillis(now),
        expiresAt,
        lockedBy: lockId
      },
      { merge: true }
    );
    acquired = true;
  });

  return acquired;
}

async function releaseLock(db, tournamentId, lockId) {
  const lockRef = db.collection("sync_locks").doc(tournamentId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(lockRef);
    if (!snap.exists || snap.data().lockedBy !== lockId) {
      return;
    }
    tx.set(
      lockRef,
      {
        lockedAt: null,
        expiresAt: null,
        lockedBy: null
      },
      { merge: true }
    );
  });
}

async function updateSyncStatus(db, tournamentId, payload) {
  const ref = db.collection("sync_status").doc(tournamentId);
  await ref.set(payload, { merge: true });
}

async function getPublicCachePlan(db, config, games, syncedAt, writeCount) {
  if (writeCount > 0) {
    return { full: true, startedGames: [] };
  }

  const ref = db.collection("public_cache").doc(`${config.tournamentId}_leaderboard`);
  const snap = await ref.get();
  if (!snap.exists) {
    return { full: true, startedGames: [] };
  }

  const visibleGames = games.filter(game => canPublishGamePredictions(game, syncedAt));
  if (visibleGames.length === 0) {
    return { full: false, startedGames: [] };
  }

  const resultRefs = visibleGames.map(game =>
    db.collection("public_results").doc(`${config.tournamentId}_${game.id}`)
  );
  const resultSnaps = await db.getAll(...resultRefs);
  const startedGames = visibleGames.filter((game, index) => {
    const expectedStatus = getPublicGameStatus(game, syncedAt);
    if (expectedStatus === "finished") return false;
    return getPublicResultStatus(resultSnaps[index]) !== "live";
  });
  const missingFinishedResult = visibleGames.some((game, index) => {
    const expectedStatus = getPublicGameStatus(game, syncedAt);
    if (expectedStatus !== "finished") return false;
    return getPublicResultStatus(resultSnaps[index]) !== "finished";
  });

  return {
    full: missingFinishedResult,
    startedGames
  };
}

async function updatePublicCache(db, config, syncedAt) {
  const gamesSnapshot = await db
    .collection("games")
    .where("tournamentId", "==", config.tournamentId)
    .get();

  const games = [];
  const predictions = [];
  const predictionsByGame = new Map();

  gamesSnapshot.forEach(doc => {
    games.push({ id: doc.id, ...doc.data() });
  });

  const visibleGames = games.filter(game => canPublishGamePredictions(game, syncedAt));
  for (const game of visibleGames) {
    const predictionsSnapshot = await db
      .collection("predictions")
      .where("gameId", "==", game.id)
      .get();

    predictionsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.tournamentId !== config.tournamentId) return;
      const prediction = { id: doc.id, ...data };
      predictions.push(prediction);
      if (!predictionsByGame.has(prediction.gameId)) {
        predictionsByGame.set(prediction.gameId, []);
      }
      predictionsByGame.get(prediction.gameId).push(prediction);
    });
  }

  const playerStats = calculatePublicPlayerStats(games, predictions);
  const userNames = buildPublicUserNames(predictions);
  const players = sortPublicPlayers(playerStats, userNames).map(([userId, stats], index) => ({
    rank: index + 1,
    userId,
    playerName: userNames[userId] || "Anónimo",
    totalPoints: stats.totalPoints,
    fechasWonCount: stats.fechasWonCount,
    perfectScoresCount: stats.perfectScoresCount,
    gamesParticipated: stats.gamesParticipated
  }));

  const batch = db.batch();
  const leaderboardRef = db.collection("public_cache").doc(`${config.tournamentId}_leaderboard`);
  batch.set(leaderboardRef, {
    tournamentId: config.tournamentId,
    generatedAt: syncedAt,
    players
  });

  let resultGames = 0;
  visibleGames
    .forEach(game => {
      const publicStatus = getPublicGameStatus(game, syncedAt);
      const resultPredictions = (predictionsByGame.get(game.id) || []).map(prediction => ({
        userId: prediction.userId || "unknown",
        playerName: prediction.playerName || "Anónimo",
        predictedHomeScore: normalizeScore(prediction.predictedHomeScore),
        predictedAwayScore: normalizeScore(prediction.predictedAwayScore),
        predictedAdvancingTeam: normalizePredictedAdvancingTeam(prediction.predictedAdvancingTeam),
        points: publicStatus === "finished" ? calculatePredictionPoints(prediction, game) : null
      }));

      const ref = db.collection("public_results").doc(`${config.tournamentId}_${game.id}`);
      batch.set(ref, {
        tournamentId: config.tournamentId,
        generatedAt: syncedAt,
        game: {
          id: game.id,
          HomeTeam: game.HomeTeam,
          AwayTeam: game.AwayTeam,
          HomeScore: game.HomeScore,
          AwayScore: game.AwayScore,
          KickOffTime: game.KickOffTime,
          Stage: game.Stage,
          Group: game.Group,
          Matchday: game.Matchday,
          StageKey: game.StageKey,
          advancingTeam: game.advancingTeam || game.AdvancingTeam || null,
          status: publicStatus
        },
        predictions: resultPredictions
      });
      resultGames += 1;
    });

  await batch.commit();

  return {
    leaderboardPlayers: players.length,
    resultGames,
    skipped: false
  };
}

async function updateStartedPublicResults(db, config, syncedAt, games) {
  if (!Array.isArray(games) || games.length === 0) {
    return { leaderboardPlayers: 0, resultGames: 0, skipped: true, partial: true };
  }

  const batch = db.batch();
  let resultGames = 0;

  for (const game of games) {
    const predictionsSnapshot = await db
      .collection("predictions")
      .where("gameId", "==", game.id)
      .get();

    const resultPredictions = [];
    predictionsSnapshot.forEach(doc => {
      const prediction = doc.data();
      if (prediction.tournamentId !== config.tournamentId) return;
      resultPredictions.push({
        userId: prediction.userId || "unknown",
        playerName: prediction.playerName || "Anónimo",
        predictedHomeScore: normalizeScore(prediction.predictedHomeScore),
        predictedAwayScore: normalizeScore(prediction.predictedAwayScore),
        predictedAdvancingTeam: normalizePredictedAdvancingTeam(prediction.predictedAdvancingTeam),
        points: null
      });
    });

    const ref = db.collection("public_results").doc(`${config.tournamentId}_${game.id}`);
    batch.set(ref, {
      tournamentId: config.tournamentId,
      generatedAt: syncedAt,
      game: {
        id: game.id,
        HomeTeam: game.HomeTeam,
        AwayTeam: game.AwayTeam,
        HomeScore: null,
        AwayScore: null,
        KickOffTime: game.KickOffTime,
        Stage: game.Stage,
        Group: game.Group,
        Matchday: game.Matchday,
        StageKey: game.StageKey,
        advancingTeam: null,
        status: "live"
      },
      predictions: resultPredictions
    });
    resultGames += 1;
  }

  await batch.commit();

  return {
    leaderboardPlayers: 0,
    resultGames,
    skipped: false,
    partial: true
  };
}

function buildPublicUserNames(predictions) {
  const latestByUser = new Map();
  predictions.forEach(prediction => {
    const userId = prediction.userId || "unknown";
    const previous = latestByUser.get(userId);
    const currentTime = toMillis(prediction.timestamp);
    const previousTime = previous ? toMillis(previous.timestamp) : -1;
    if (!previous || currentTime >= previousTime) {
      latestByUser.set(userId, prediction);
    }
  });

  const names = {};
  latestByUser.forEach((prediction, userId) => {
    names[userId] = prediction.playerName || "Anónimo";
  });
  return names;
}

function calculatePublicPlayerStats(games, predictions) {
  const playerStats = {};
  const stageScores = {};
  const gameMap = new Map(games.map(game => [game.id, game]));

  predictions.forEach(prediction => {
    const userId = prediction.userId || "unknown";
    if (!playerStats[userId]) {
      playerStats[userId] = {
        totalPoints: 0,
        fechasWonCount: 0,
        perfectScoresCount: 0,
        gamesParticipated: 0
      };
    }
  });

  predictions.forEach(prediction => {
    const userId = prediction.userId || "unknown";
    const game = gameMap.get(prediction.gameId);
    if (!game) return;

    const points = calculatePredictionPoints(prediction, game);
    if (points === null) return;
    const scorePoints = calculatePredictionScorePoints(prediction, game);

    playerStats[userId].totalPoints += points;
    playerStats[userId].gamesParticipated += 1;
    if (scorePoints === 10) {
      playerStats[userId].perfectScoresCount += 1;
    }

    const stageKey = game.StageKey || buildStageKeyForCache(game);
    if (!stageKey) return;
    if (!stageScores[stageKey]) {
      stageScores[stageKey] = {};
    }
    stageScores[stageKey][userId] = (stageScores[stageKey][userId] || 0) + points;
  });

  Object.values(stageScores).forEach(playersInStage => {
    const scores = Object.values(playersInStage);
    if (scores.length === 0) return;
    const maxScore = Math.max(...scores);
    if (maxScore <= 0) return;
    Object.entries(playersInStage).forEach(([userId, score]) => {
      if (score === maxScore) {
        playerStats[userId].fechasWonCount += 1;
      }
    });
  });

  return playerStats;
}

function sortPublicPlayers(playerStats, userNames) {
  return Object.entries(playerStats).sort(([idA, statsA], [idB, statsB]) => {
    if (statsB.totalPoints !== statsA.totalPoints) {
      return statsB.totalPoints - statsA.totalPoints;
    }
    if (statsB.fechasWonCount !== statsA.fechasWonCount) {
      return statsB.fechasWonCount - statsA.fechasWonCount;
    }
    if (statsB.perfectScoresCount !== statsA.perfectScoresCount) {
      return statsB.perfectScoresCount - statsA.perfectScoresCount;
    }
    return String(userNames[idA] || idA).localeCompare(String(userNames[idB] || idB));
  });
}

function calculatePredictionPoints(prediction, game) {
  const scorePoints = calculatePredictionScorePoints(prediction, game);
  if (scorePoints === null) return null;
  return scorePoints + calculateAdvancerBonus(prediction, game);
}

function calculatePredictionScorePoints(prediction, game) {
  const gameStatus = normalizeGameStatusForScoring(game);
  const actualHome = normalizeScore(game.HomeScore !== undefined ? game.HomeScore : game.homeScore);
  const actualAway = normalizeScore(game.AwayScore !== undefined ? game.AwayScore : game.awayScore);
  if (gameStatus !== "finished" || actualHome === null || actualAway === null) {
    return null;
  }

  const predictedHome = normalizeScore(prediction.predictedHomeScore);
  const predictedAway = normalizeScore(prediction.predictedAwayScore);
  if (predictedHome === null || predictedAway === null) {
    return 0;
  }

  let points = 0;
  const predictedOutcome = predictedHome > predictedAway ? "HW" : predictedHome < predictedAway ? "AW" : "D";
  const actualOutcome = actualHome > actualAway ? "HW" : actualHome < actualAway ? "AW" : "D";
  if (predictedOutcome === actualOutcome) points += 5;
  if (predictedHome === actualHome) points += 2;
  if (predictedAway === actualAway) points += 2;
  if (Math.abs(predictedHome - predictedAway) === Math.abs(actualHome - actualAway)) points += 1;
  return points;
}

function calculateAdvancerBonus(prediction, game) {
  if (!isKnockoutGameForScoring(game)) return 0;
  const predictedAdvancer = normalizePredictedAdvancingTeam(prediction.predictedAdvancingTeam);
  const actualAdvancer = getActualAdvancingTeam(game);
  return predictedAdvancer && actualAdvancer && predictedAdvancer === actualAdvancer ? 2 : 0;
}

function getStageIdForScoring(game) {
  const stage = String(game.Stage || game.stage || "").toUpperCase();
  if (stage) return stage;
  const stageKey = String(game.StageKey || game.stageKey || "").toUpperCase();
  return stageKey.startsWith("GROUP-") ? "GROUP" : stageKey;
}

function isKnockoutGameForScoring(game) {
  const stage = getStageIdForScoring(game);
  return !!stage && stage !== "GROUP";
}

function normalizePredictedAdvancingTeam(value) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "home" || normalized === "away" ? normalized : null;
}

function normalizeAdvancingTeam(value, game) {
  const normalized = normalizePredictedAdvancingTeam(value);
  if (normalized) return normalized;

  const raw = String(value || "").trim().toLowerCase();
  const homeName = String(game.HomeTeam || game.homeTeam || "").trim().toLowerCase();
  const awayName = String(game.AwayTeam || game.awayTeam || "").trim().toLowerCase();
  if (raw && raw === homeName) return "home";
  if (raw && raw === awayName) return "away";
  return null;
}

function getActualAdvancingTeam(game) {
  if (!isKnockoutGameForScoring(game)) return null;

  const explicit = normalizeAdvancingTeam(game.advancingTeam || game.AdvancingTeam, game);
  if (explicit) return explicit;

  const actualHome = normalizeScore(game.HomeScore !== undefined ? game.HomeScore : game.homeScore);
  const actualAway = normalizeScore(game.AwayScore !== undefined ? game.AwayScore : game.awayScore);
  if (actualHome === null || actualAway === null || actualHome === actualAway) {
    return null;
  }
  return actualHome > actualAway ? "home" : "away";
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeGameStatusForScoring(game) {
  const raw = game.status !== undefined && game.status !== null ? game.status : game.Status;
  const normalized = String(raw || "").toLowerCase();
  if (normalized === "in_play") return "live";
  if (normalized === "scheduled") return "upcoming";
  return normalized;
}

function getPublicResultStatus(snap) {
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return normalizeGameStatusForScoring(data.game || data);
}

function canPublishGamePredictions(game, syncedAt) {
  const status = normalizeGameStatusForScoring(game);
  return status === "finished" || status === "live" || hasGameStartedForCache(game, syncedAt);
}

function getPublicGameStatus(game, syncedAt) {
  const status = normalizeGameStatusForScoring(game);
  if (status === "finished") return "finished";
  if (status === "live" || hasGameStartedForCache(game, syncedAt)) return "live";
  return "upcoming";
}

function hasGameStartedForCache(game, syncedAt) {
  const kickoffMs = toMillis(game.KickOffTime || game.utcDate);
  if (!kickoffMs) return false;
  const syncedMs = syncedAt?.toMillis ? syncedAt.toMillis() : toMillis(syncedAt);
  return kickoffMs <= syncedMs;
}

function buildStageKeyForCache(game) {
  const stage = game.Stage || game.stage;
  if (!stage) return null;
  if (stage === "GROUP") {
    const group = game.Group || game.group;
    const matchday = game.Matchday || game.matchday;
    if (!group || !matchday) return null;
    return `GROUP-${group}-MD${matchday}`;
  }
  return stage;
}

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
