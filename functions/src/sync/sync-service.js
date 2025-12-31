const admin = require("firebase-admin");
const { createProvider } = require("../providers/provider-factory");
const { getConfig, validateProviderConfig } = require("../config");
const { mapMatchToGame, buildMatchKey } = require("./mappers");

const LOCK_COLLECTION = "sync_locks";
const STATUS_COLLECTION = "sync_status";

async function syncMatches({ mode, dateFrom, dateTo, allowManualOverwrite = false }) {
  const config = getConfig();
  validateProviderConfig(config);

  const db = admin.firestore();
  const provider = createProvider(config);

  const now = admin.firestore.Timestamp.now();
  const lockKey = `${config.tournamentId}_${config.provider}`;

  return withSyncLock(db, lockKey, async () => {
    let matches = [];
    try {
      matches = await provider.getMatchesByDateRange(dateFrom, dateTo);
    } catch (error) {
      const syncStatus = error.code === "rate_limit" ? "rate_limit" : "error";
      await updateSyncStatus(db, config.tournamentId, {
        lastRunAt: now,
        syncStatus,
        syncError: error.message || String(error),
        provider: config.provider,
        mode,
        dateFrom,
        dateTo
      });
      throw error;
    }

    const existingSnapshot = await db
      .collection("games")
      .where("tournamentId", "==", config.tournamentId)
      .get();

    const byExternal = new Map();
    const byMatchKey = new Map();

    existingSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.externalProvider && data.externalMatchId) {
        const key = `${data.externalProvider}:${data.externalMatchId}`;
        byExternal.set(key, doc);
      }
      const key = buildMatchKey({
        homeTeam: data.HomeTeam,
        awayTeam: data.AwayTeam,
        utcDate: data.utcDate || data.KickOffTime
      });
      if (key) {
        byMatchKey.set(key, doc);
      }
    });

    const batch = db.batch();
    let updated = 0;
    let created = 0;
    let skippedManual = 0;
    let skippedUnchanged = 0;
    let writeCount = 0;

    matches.forEach(match => {
      const mapped = mapMatchToGame(match, config.provider);
      if (!mapped.externalMatchId) {
        return;
      }
      const externalKey = `${config.provider}:${mapped.externalMatchId}`;
      const matchKey = buildMatchKey({
        homeTeam: mapped.HomeTeam,
        awayTeam: mapped.AwayTeam,
        utcDate: mapped.utcDate
      });

      const existingDoc = byExternal.get(externalKey) || (matchKey ? byMatchKey.get(matchKey) : null);

      if (existingDoc) {
        const existingData = existingDoc.data();
        if (existingData.isManuallyEdited && !allowManualOverwrite) {
          const manualUpdate = {
            lastSyncedAt: now,
            syncStatus: "skipped_manual"
          };
          batch.set(existingDoc.ref, manualUpdate, { merge: true });
          writeCount += 1;
          skippedManual += 1;
          return;
        }

        const updatePayload = {
          ...mapped,
          tournamentId: config.tournamentId,
          lastSyncedAt: now,
          syncStatus: "ok",
          syncError: null
        };
        const sanitized = sanitizePayload(updatePayload, existingData);
        if (!hasChanges(sanitized, existingData)) {
          skippedUnchanged += 1;
          return;
        }
        batch.set(existingDoc.ref, sanitized, { merge: true });
        writeCount += 1;
        updated += 1;
        return;
      }

      const docId = `${config.provider}_${mapped.externalMatchId}`;
      const docRef = db.collection("games").doc(docId);
      const createPayload = {
        ...mapped,
        tournamentId: config.tournamentId,
        lastSyncedAt: now,
        syncStatus: "ok",
        syncError: null,
        isManuallyEdited: false
      };
      const sanitizedCreate = sanitizePayload(createPayload, {});
      batch.set(docRef, sanitizedCreate, { merge: true });
      writeCount += 1;
      created += 1;
    });

    if (writeCount > 0) {
      await batch.commit();
    }

    await updateSyncStatus(db, config.tournamentId, {
      lastRunAt: now,
      lastSuccessAt: now,
      syncStatus: "ok",
      syncError: null,
      provider: config.provider,
      mode,
      dateFrom,
      dateTo,
      updated,
      created,
      skippedManual,
      skippedUnchanged
    });

    return { updated, created, skippedManual, skippedUnchanged, totalMatches: matches.length };
  });
}

async function updateSyncStatus(db, tournamentId, payload) {
  const ref = db.collection(STATUS_COLLECTION).doc(tournamentId);
  await ref.set(payload, { merge: true });
}

async function withSyncLock(db, lockKey, handler) {
  const lockRef = db.collection(LOCK_COLLECTION).doc(lockKey);
  const now = Date.now();
  const ttlMs = 60 * 1000;
  const expiresAt = admin.firestore.Timestamp.fromMillis(now + ttlMs);

  await db.runTransaction(async tx => {
    const snap = await tx.get(lockRef);
    if (snap.exists) {
      const data = snap.data();
      if (data.expiresAt && data.expiresAt.toMillis() > now) {
        throw new Error("Sync already running");
      }
    }
    tx.set(
      lockRef,
      {
        lockedAt: admin.firestore.Timestamp.fromMillis(now),
        expiresAt,
        lockedBy: process.env.K_REVISION || "manual"
      },
      { merge: true }
    );
  });

  try {
    return await handler();
  } finally {
    await lockRef.set(
      {
        lockedAt: null,
        expiresAt: null,
        lockedBy: null
      },
      { merge: true }
    );
  }
}

module.exports = {
  syncMatches
};

function sanitizePayload(payload, existingData) {
  const sanitized = { ...payload };
  const mappedStatus = String(payload.status || "");
  const existingStatus = String(existingData.status || "");

  if (existingStatus === "FINISHED" && mappedStatus !== "FINISHED") {
    sanitized.status = existingData.status;
    sanitized.Status = existingData.Status;
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
