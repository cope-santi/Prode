const admin = require("firebase-admin");
const express = require("express");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");

const { getConfig } = require("./src/config");
const { syncMatches } = require("./src/sync/sync-service");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({
  region: "us-central1",
  timeoutSeconds: 60,
  memory: "256MiB"
});

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/matches", async (req, res) => {
  try {
    const config = getConfig();
    const snapshot = await db
      .collection("games")
      .where("tournamentId", "==", config.tournamentId)
      .get();

    const matches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ matches, count: matches.length });
  } catch (error) {
    logger.error("GET /api/matches failed", error);
    res.status(500).json({ error: "Failed to load matches." });
  }
});

app.get("/api/sync/status", async (req, res) => {
  try {
    const config = getConfig();
    const statusSnap = await db.collection("sync_status").doc(config.tournamentId).get();
    res.json(statusSnap.exists ? statusSnap.data() : {});
  } catch (error) {
    logger.error("GET /api/sync/status failed", error);
    res.status(500).json({ error: "Failed to load sync status." });
  }
});

app.post("/api/sync", requireAdmin, async (req, res) => {
  try {
    const config = getConfig();
    const { mode = "manual", allowManualOverwrite = false, dateFrom, dateTo } = req.body || {};
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : buildLiveRange(config);
    const result = await syncMatches({
      mode,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      allowManualOverwrite: Boolean(allowManualOverwrite)
    });

    res.json({ ok: true, result });
  } catch (error) {
    logger.error("POST /api/sync failed", error);
    res.status(500).json({ error: error.message || "Sync failed." });
  }
});

function requireAdmin(req, res, next) {
  const config = getConfig();
  if (!config.adminUid) {
    return res.status(500).json({ error: "ADMIN_UID not configured." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization Bearer token." });
  }

  admin
    .auth()
    .verifyIdToken(token)
    .then(decoded => {
      if (decoded.uid !== config.adminUid) {
        res.status(403).json({ error: "Not authorized." });
        return;
      }
      req.user = decoded;
      next();
    })
    .catch(error => {
      logger.warn("Token verification failed", error);
      res.status(401).json({ error: "Invalid token." });
    });
}

function buildLiveRange(config) {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + config.liveDaysAhead * 24 * 60 * 60 * 1000);
  return {
    dateFrom: toIsoDate(from),
    dateTo: toIsoDate(to)
  };
}

function buildFixtureRange(config) {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + config.fixtureDaysAhead * 24 * 60 * 60 * 1000);
  return {
    dateFrom: toIsoDate(from),
    dateTo: toIsoDate(to)
  };
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function shouldSyncLive() {
  const config = getConfig();
  const snapshot = await db
    .collection("games")
    .where("tournamentId", "==", config.tournamentId)
    .get();

  if (snapshot.empty) {
    return false;
  }

  const now = Date.now();
  const windowStart = now - 6 * 60 * 60 * 1000;
  const windowEnd = now + 36 * 60 * 60 * 1000;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const status = String(data.status || data.Status || "").toLowerCase();
    if (status === "finished") {
      continue;
    }

    const utcDate = data.utcDate || data.KickOffTime;
    if (!utcDate) {
      continue;
    }

    const time = Date.parse(utcDate);
    if (!Number.isNaN(time) && time >= windowStart && time <= windowEnd) {
      return true;
    }
  }

  return false;
}

exports.api = onRequest(app);

exports.syncDailyFixtures = onSchedule("0 4 * * *", async () => {
  const config = getConfig();
  const { dateFrom, dateTo } = buildFixtureRange(config);
  logger.info("Running daily fixture sync", { dateFrom, dateTo });
  try {
    await syncMatches({ mode: "daily", dateFrom, dateTo });
  } catch (error) {
    logger.error("Daily fixture sync failed", error);
  }
});

exports.syncLiveMatches = onSchedule("* * * * *", async () => {
  const config = getConfig();
  const shouldRun = await shouldSyncLive();
  if (!shouldRun) {
    logger.info("Skipping live sync (no upcoming or live matches).");
    return;
  }

  const { dateFrom, dateTo } = buildLiveRange(config);
  logger.info("Running live sync", { dateFrom, dateTo });
  try {
    await syncMatches({ mode: "live", dateFrom, dateTo });
  } catch (error) {
    if (String(error.message || "").includes("Sync already running")) {
      logger.warn("Live sync skipped: already running.");
      return;
    }
    logger.error("Live sync failed", error);
  }
});
