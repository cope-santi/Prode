const admin = require('firebase-admin');
const countries = require('i18n-iso-countries');

countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

const SERVICE_ACCOUNT_KEY_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json';
let serviceAccount = null;
try {
    serviceAccount = require(SERVICE_ACCOUNT_KEY_PATH);
} catch (error) {
    console.error(`Error loading service account key at ${SERVICE_ACCOUNT_KEY_PATH}:`, error.message);
    process.exit(1);
}

const TOURNAMENT_ID = process.env.TOURNAMENT_ID || 'FIFA2026';
const FLAG_BASE_URL = process.env.FLAG_BASE_URL || 'https://flagcdn.com';
const FLAG_SIZE = process.env.FLAG_SIZE || 'w80';
const FLAG_FORMAT = process.env.FLAG_FORMAT || 'png';
const FORCE_FLAG_LOGOS = process.env.FORCE_FLAG_LOGOS === 'true';
const DRY_RUN = process.env.DRY_RUN === 'true';

const SPECIAL_FLAG_CODES = {
    'england': 'gb-eng',
    'scotland': 'gb-sct',
    'wales': 'gb-wls',
    'northern ireland': 'gb-nir',
    'usa': 'us',
    'u.s.a.': 'us',
    'united states': 'us',
    'united states of america': 'us',
    'korea republic': 'kr',
    'south korea': 'kr',
    'korea, south': 'kr',
    'korea dpr': 'kp',
    'north korea': 'kp',
    'iran': 'ir',
    'ivory coast': 'ci',
    'cote d\'ivoire': 'ci',
    'cote d ivoire': 'ci',
    'czech republic': 'cz',
    'czechia': 'cz',
    'russia': 'ru',
    'syria': 'sy',
    'vietnam': 'vn',
    'laos': 'la',
    'brunei': 'bn',
    'cape verde': 'cv',
    'bolivia': 'bo',
    'venezuela': 've',
    'tanzania': 'tz',
    'swaziland': 'sz',
    'eswatini': 'sz',
    'uae': 'ae',
    'united arab emirates': 'ae',
    'timor-leste': 'tl',
    'dr congo': 'cd',
    'congo dr': 'cd',
    'republic of the congo': 'cg',
    'congo': 'cg'
};

const NAME_ALIASES = {
    'iran': 'Iran, Islamic Republic of',
    'tanzania': 'Tanzania, United Republic of',
    'venezuela': 'Venezuela, Bolivarian Republic of',
    'bolivia': 'Bolivia, Plurinational State of',
    'moldova': 'Moldova, Republic of',
    'brunei': 'Brunei Darussalam',
    'laos': "Lao People's Democratic Republic",
    'vietnam': 'Viet Nam',
    'russia': 'Russian Federation',
    'syria': 'Syrian Arab Republic',
    'cape verde': 'Cabo Verde',
    'swaziland': 'Eswatini',
    'uae': 'United Arab Emirates'
};

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK initialized.');
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error.message);
    process.exit(1);
}

const db = admin.firestore();

function normalizeTeamName(name) {
    return String(name || '')
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function buildDocId(name) {
    const normalized = normalizeTeamName(name);
    return normalized
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function resolveFlagCode(teamName) {
    const normalized = normalizeTeamName(teamName);
    if (!normalized) return null;

    if (SPECIAL_FLAG_CODES[normalized]) {
        return SPECIAL_FLAG_CODES[normalized];
    }

    const aliasName = NAME_ALIASES[normalized];
    let code = aliasName ? countries.getAlpha2Code(aliasName, 'en') : null;
    if (!code) {
        code = countries.getAlpha2Code(teamName, 'en');
    }
    if (!code) {
        code = countries.getAlpha2Code(normalized, 'en');
    }
    return code ? code.toLowerCase() : null;
}

function buildFlagUrl(flagCode) {
    return `${FLAG_BASE_URL}/${FLAG_SIZE}/${flagCode}.${FLAG_FORMAT}`;
}

async function loadTeamsFromGames() {
    const snapshot = await db
        .collection('games')
        .where('tournamentId', '==', TOURNAMENT_ID)
        .get();

    const teams = new Set();
    snapshot.forEach(doc => {
        const data = doc.data() || {};
        if (data.HomeTeam) teams.add(data.HomeTeam);
        if (data.AwayTeam) teams.add(data.AwayTeam);
    });

    return Array.from(teams).sort();
}

async function loadExistingTeams() {
    const snapshot = await db.collection('teams').get();
    const existing = new Map();
    snapshot.forEach(doc => {
        const data = doc.data() || {};
        if (!data.name) return;
        existing.set(normalizeTeamName(data.name), { id: doc.id, data });
    });
    return existing;
}

async function uploadFlags() {
    const teams = await loadTeamsFromGames();
    const existingByName = await loadExistingTeams();

    let updated = 0;
    let skippedMissing = 0;
    let skippedExisting = 0;

    const maxBatchSize = 450;
    let batch = db.batch();
    let batchCount = 0;

    for (const teamName of teams) {
        const normalized = normalizeTeamName(teamName);
        if (!normalized) continue;

        const existing = existingByName.get(normalized);
        const existingLogo = existing?.data?.logoUrl;
        if (existingLogo && !FORCE_FLAG_LOGOS && !existingLogo.includes('flagcdn.com')) {
            skippedExisting += 1;
            continue;
        }

        const flagCode = resolveFlagCode(teamName);
        if (!flagCode) {
            console.warn(`[uploadFlags] No flag code found for "${teamName}".`);
            skippedMissing += 1;
            continue;
        }

        const flagUrl = buildFlagUrl(flagCode);
        const docId = existing?.id || buildDocId(teamName);
        const payload = {
            name: teamName,
            logoUrl: flagUrl,
            logoSource: 'flagcdn'
        };

        if (!DRY_RUN) {
            const ref = db.collection('teams').doc(docId);
            batch.set(ref, payload, { merge: true });
            batchCount += 1;

            if (batchCount >= maxBatchSize) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }

        updated += 1;
        console.log(`[uploadFlags] ${teamName} -> ${flagUrl}`);
    }

    if (!DRY_RUN && batchCount > 0) {
        await batch.commit();
    }

    console.log(`Done. Updated: ${updated}, skipped missing: ${skippedMissing}, skipped existing: ${skippedExisting}.`);
}

if (require.main === module) {
    uploadFlags().catch(error => {
        console.error('uploadFlags failed:', error);
        process.exitCode = 1;
    });
}

module.exports = { uploadFlags };
