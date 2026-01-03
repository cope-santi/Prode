const admin = require("firebase-admin");
const { setTimeout: delay } = require("node:timers/promises");
const { mapEventToGame } = require("./mapper");

const CACHE = new Map();

async function run() {
  const config = loadConfig();
  const db = initFirebase(config);

  const lockAcquired = await acquireLock(db, config);
  if (!lockAcquired) {
    console.log("Sync already running. Exiting.");
    return;
  }

  const now = admin.firestore.Timestamp.now();
  try {
    const events = await loadEvents(config);

    const snapshot = await db
      .collection("games")
      .where("tournamentId", "==", config.tournamentId)
      .get();

    const byExternal = new Map();
    const byMatchKey = new Map();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.externalProvider && data.externalMatchId) {
        byExternal.set(`${data.externalProvider}:${data.externalMatchId}`, doc);
      }
      const matchKey = buildMatchKey(data.HomeTeam, data.AwayTeam, data.utcDate || data.KickOffTime);
      if (matchKey) {
        byMatchKey.set(matchKey, doc);
      }
    });

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
      totalEvents: events.length
    });
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
    await releaseLock(db, config.tournamentId);
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
    lockMinutes: parseInt(process.env.POST_MATCH_SYNC_MINUTES || "10", 10)
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
    status: mapped.status === "FINISHED" ? "FINISHED" : "SCHEDULED",
    HomeTeam: mapped.HomeTeam,
    AwayTeam: mapped.AwayTeam,
    KickOffTime: mapped.utcDate,
    Status: mapped.status === "FINISHED" ? "finished" : "upcoming",
    Stage: mapped.Stage,
    Group: mapped.Group,
    Matchday: mapped.Matchday,
    StageKey: mapped.StageKey,
    tournamentId: config.tournamentId,
    lastSyncedAt: now,
    syncStatus: "ok",
    syncError: null
  };

  if (mapped.status === "FINISHED") {
    payload.score = mapped.score;
    payload.HomeScore = mapped.HomeScore;
    payload.AwayScore = mapped.AwayScore;
  } else if (isCreate) {
    payload.HomeScore = null;
    payload.AwayScore = null;
  }

  if (isCreate) {
    payload.isManuallyEdited = false;
  }

  return payload;
}

function sanitizePayload(payload, existingData) {
  const sanitized = { ...payload };
  const existingStatus = String(existingData.status || "");

  if (existingStatus === "FINISHED" && sanitized.status !== "FINISHED") {
    sanitized.status = existingData.status;
    sanitized.Status = existingData.Status;
    delete sanitized.score;
    delete sanitized.HomeScore;
    delete sanitized.AwayScore;
  }

  if (sanitized.status !== "FINISHED") {
    delete sanitized.score;
    delete sanitized.HomeScore;
    delete sanitized.AwayScore;
  }

  return sanitized;
}

function hasChanges(payload, existingData) {
  const fields = [
    "HomeTeam",
    "AwayTeam",
    "KickOffTime",
    "utcDate",
    "Status",
    "status",
    "HomeScore",
    "AwayScore",
    "Stage",
    "Group",
    "Matchday",
    "StageKey",
    "externalProvider",
    "externalMatchId",
    "score"
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

async function acquireLock(db, config) {
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
        lockedBy: "github-actions"
      },
      { merge: true }
    );
    acquired = true;
  });

  return acquired;
}

async function releaseLock(db, tournamentId) {
  const lockRef = db.collection("sync_locks").doc(tournamentId);
  await lockRef.set(
    {
      lockedAt: null,
      expiresAt: null,
      lockedBy: null
    },
    { merge: true }
  );
}

async function updateSyncStatus(db, tournamentId, payload) {
  const ref = db.collection("sync_status").doc(tournamentId);
  await ref.set(payload, { merge: true });
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
