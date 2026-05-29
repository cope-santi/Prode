const admin = require("firebase-admin");

function loadConfig() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const tournamentId = process.env.TOURNAMENT_ID;

  if (!serviceAccountJson) throw new Error("Missing env var: FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!projectId) throw new Error("Missing env var: FIREBASE_PROJECT_ID");
  if (!tournamentId) throw new Error("Missing env var: TOURNAMENT_ID");

  const serviceAccount = JSON.parse(serviceAccountJson);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return { serviceAccount, projectId, tournamentId };
}

async function run() {
  const config = loadConfig();
  admin.initializeApp({
    credential: admin.credential.cert(config.serviceAccount),
    projectId: config.projectId
  });

  const db = admin.firestore();
  const snapshot = await db
    .collection("predictions")
    .where("tournamentId", "==", config.tournamentId)
    .get();

  let batch = db.batch();
  let batchCount = 0;
  let updated = 0;

  for (const doc of snapshot.docs) {
    if (!Object.prototype.hasOwnProperty.call(doc.data(), "userEmail")) continue;

    batch.update(doc.ref, {
      userEmail: admin.firestore.FieldValue.delete()
    });
    batchCount += 1;
    updated += 1;

    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Removed userEmail from ${updated} prediction document(s).`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
