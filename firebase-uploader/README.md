# Firebase Admin Tools

Admin utilities for managing EA Football Predictor data, including fixture fetching from TheSportsDB and logo uploads to Firebase Storage.

## Folder Structure

```
firebase-uploader/
├── src/                          # Source modules
│   ├── fetchFixtures.js         # TheSportsDB fixture fetcher (team search, upcoming matches)
│   └── uploadLogos.js           # Firebase Storage logo uploader
├── tests/                        # Test suites
│   └── testFetchFixtures.js     # Fixture fetcher unit tests
├── data/                         # Data files (excluded from git)
│   └── logos/                    # Downloaded team logos
├── package.json                  # Node dependencies
├── serviceAccountKey.json        # Firebase service account (NOT in git - local only!)
├── serviceAccountKey_sample.json # Template for service account credentials
└── README.md                     # This file
```

## Setup

### 1. Install Dependencies
```bash
cd firebase-uploader
npm install
```

### 2. Firebase Service Account Key
Create a local `serviceAccountKey.json` from your Firebase Console:
1. Go to **Project Settings → Service Accounts**
2. Click **Generate New Private Key**
3. Save as `serviceAccountKey.json` in this directory
4. **Never commit this file** (already in `.gitignore`)

### 3. TheSportsDB API Key
Set `THESPORTSDB_API_KEY` (env var preferred) or update `src/fetchFixtures.js` and `src/uploadLogos.js`:
- Get your free API key at https://www.thesportsdb.com/api.php
- Replace `'123'` with your actual key

## Available Scripts

### Test Fixture Fetcher
```bash
node tests/testFetchFixtures.js
```
Tests:
- ✅ API connectivity to TheSportsDB
- ✅ Team search functionality
- ✅ Fixture fetching and filtering
- ✅ Data structure validation
- ✅ League normalization
- ✅ Chronological sorting validation
- ✅ Status validation

### Upload Team Logos
```bash
node src/uploadLogos.js
```
- Searches TheSportsDB for team logos
- Uploads to Firebase Storage
- Updates Firestore `teams` collection with logo URLs
- Respects API rate limits (delay configured in code)

### Fetch Fixtures (Manual Testing)
```bash
# In your code:
const { searchFixture } = require('./src/fetchFixtures.js');
const fixtures = await searchFixture('Manchester United', 'Liverpool');
```

## Module Documentation

### fetchFixtures.js

Main functions:

#### `searchTeam(teamName)`
Search for a team by name on TheSportsDB
- Returns: TheSportsDB team ID (string) or null
- Rate limited: 1 request per 6 seconds

#### `searchFixture(homeTeamName, awayTeamName)`
Search upcoming fixtures between two teams
- Returns: Array of fixture objects with auto-populated League
- Includes: `thesportsdbEventId` (for later score automation)

#### `logFixtureDetails(fixture)`
Debug utility to pretty-print fixture data

### Fixture Object Structure
```javascript
{
  HomeTeam: "Manchester United",
  AwayTeam: "Liverpool",
  KickOffTime: "2025-01-15T15:00:00.000Z",  // ISO 8601
  Status: "upcoming",
  League: "Premier League",                  // Auto-normalized!
  thesportsdbEventId: "765432",             // For score automation
  HomeScore: null,                           // Filled when match ends
  AwayScore: null,
  Fecha: null                                // Set by admin
}
```

### uploadLogos.js

Functionality:
- Fetches team logos from TheSportsDB
- Uploads to Firebase Storage
- Updates Firestore `teams` collection with `logoUrl` field
- Handles missing logos gracefully
- Logs progress for each team

**Currently only `Lazio` is uncommented as a test.** Uncomment teams in `teamsData` array to enable uploads.

## Rate Limiting

TheSportsDB free tier: **~240 requests/day**

Both modules enforce short delays between requests (see `RATE_LIMIT_MS`).

## Debugging

All modules use tagged console logs:
```
[searchTeam] Found: Manchester United (ID: 133606)
[searchFixture] Filtered to upcoming fixtures
[uploadLogosToFirestore] Uploaded logo for Barcelona
```

Check the browser/terminal console for detailed operation logs.

## Common Issues

| Issue | Solution |
|-------|----------|
| "Firebase Admin SDK initialized successfully" error | Update path to `serviceAccountKey.json` |
| No team found | Team name may be spelled differently in TheSportsDB; check spelling |
| No fixtures returned | Team may have no upcoming matches in 14-day window |
| Rate limit waiting messages | Normal behavior; API enforces 1 request/6 seconds |
| "API key is not valid" | Update `THESPORTSDB_API_KEY` with your actual key |

## Next Steps

- [ ] Phase 2: Integrate fixture picker into `index.html` admin form
- [ ] Phase 3: Store `thesportsdbEventId` in Firestore games
- [ ] Phase 4: Create `updateScores.js` for automated score fetching
- [ ] Phase 5: Set up Cloud Functions for scheduled score updates
