# EA Football Predictor

A modern, modular web application for predicting football match outcomes, tracking results, and managing a community leaderboard. Built with vanilla JavaScript ES modules, Firebase backend, and a responsive dark-themed UI.

#### ⚽️ Features

* **User Authentication**: Secure sign-up and sign-in functionality using Firebase Authentication.
* **Match Predictions**: Users can submit their predicted scores for upcoming football matches.
* **Live Updates**: Match information, including results and statuses (Upcoming, Live, Finished), are loaded dynamically.
* **Scoring System**: A detailed, centralized scoring logic calculates points based on:
    * Correct outcome (win, loss, or draw)
    * Correct home team goals
    * Correct away team goals
    * Correct goal difference
* **Leaderboard**: A comprehensive, real-time leaderboard tracks player standings by total points, phase wins, and perfect scores.
* **Phase Matrix**: Compare all players' scores across matches by tournament phase with toggle for predictions visualization.
* **Player History Modal**: Click any player name to view their complete prediction history with stats.
* **Responsive Design**: Built with Bootstrap and custom CSS for a clean, mobile-friendly dark interface.

#### 🏗️ Architecture

**Modular JavaScript Structure:**
- `js/firebase-config.js` - Centralized Firebase configuration
- `js/calculations.js` - Centralized scoring logic with data normalization
- `js/ui-helpers.js` - Shared UI components (modals, leaderboard rendering, event delegation)

**Pages:**
- `index.html` - Home page with navigation
- `leaderboard.html` - Overall player standings with clickable player history
- `game_weeks.html` - Phase matrix view comparing player scores
- `crearCuenta.html` - Account creation page

**Styling:**
- `css/styles_final.css` - Consolidated stylesheet (dark theme with teal accents)
- `css/styles2.css` - Legacy styles (retained for compatibility)
- `css/icon/favicon-ball.ico` - Favicon

**Firebase:**
- `firebase.json` - Firebase configuration
- `.firebaserc` - Firebase project reference
- `firebase-uploader/` - Cloud Storage logo upload utility

#### 🚀 Live Deployment

The application is deployed on **Firebase Hosting**:
**🔗 https://ea-football-predictor.web.app**

#### 🚀 How to Run Locally

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/josedanielcl18/EA-app.git
    cd EA-app
    ```

2.  **Set up Firebase**:
    This application requires a Firebase project to store game data and user predictions.
    * Create a new project on the [Firebase Console](https://console.firebase.google.com/).
    * Enable **Firestore Database** and **Firebase Authentication** (with Email/Password sign-in).
    * Find your project's configuration details and update `js/firebase-config.js` with your credentials.

3.  **Run a Local Server**:
    To properly load the Firebase module imports and other local files, run a local web server:
    ```bash
    python3 -m http.server
    ```
    Alternatively, use `npx serve` or any other local server.

4.  **Open in Browser**:
    Navigate to `http://localhost:8000` and explore!

#### 🏆 Cómo cargar datos del Mundial 2026

1. **Configurar torneo único**:
   * Verifica `js/tournament-config.js` (tournamentId `FIFA2026`, displayName `FIFA World Cup 2026`, stages y grupos A–L).
2. **Cargar equipos**:
   * En la colección `teams` de Firestore, guarda solo selecciones nacionales y sus logos (campo `name` y `logoUrl`).
3. **Cargar partidos**:
   * En la colección `games`, cada documento debe incluir:
     * `tournamentId: "FIFA2026"`
     * `Stage` (`GROUP`, `R32`, `R16`, `QF`, `SF`, `3P`, `FINAL`)
     * `Group` (A–L) y `Matchday` (1–3) **solo** para fase de grupos
     * `StageKey` (`GROUP-A-MD1` o `R16`, etc.)
     * `KickOffTime`, `HomeTeam`, `AwayTeam`, `Status`, `HomeScore`, `AwayScore`
4. **Cargar fixtures desde TheSportsDB** (opcional):
   * El buscador de fixtures filtra por “World Cup” si TheSportsDB devuelve el torneo.
   * Revisa que `theSportsDbLeagueId` en `js/tournament-config.js` esté definido si usas ID de liga.

## 🔒 Security Notes

This repository previously contained exposed Firebase service account credentials. These have been:
- ✅ Removed from the repository
- ✅ Added to `.gitignore`
- ✅ Rotated in the Firebase Console

**Best Practices Applied:**
- Credentials are never committed to version control
- Firebase config is separated into `js/firebase-config.js`
- Service account keys stored locally only (not in repo)
- Sensitive files protected via `.gitignore`

To run the logo uploader locally (if needed):
1. Create a local `firebase-uploader/serviceAccountKey.json` (not committed)
2. Run: `cd firebase-uploader && npm install && node uploadLogos.js`

#### 🛠️ Technologies Used

* **Front-end**: HTML5, CSS3, JavaScript ES6+ (ES Modules)
* **Frameworks**: Bootstrap 4.5.2
* **Backend**: Firebase (Firestore, Authentication, Hosting)
* **Development**: Git, Node.js (optional, for firebase-cli)

#### 📊 Scoring Algorithm

The scoring system is centralized in `js/calculations.js` and calculates points as follows:

| Prediction Accuracy | Points |
|---|---|
| Perfect (all 4 elements correct) | 10 |
| Correct outcome + 1 goal | 7-9 |
| Correct outcome only | 4-6 |
| Partial match (1 goal) | 1-3 |
| Incorrect | 0 |

**Elements checked:**
1. Match outcome (Win/Draw/Loss)
2. Home team goals
3. Away team goals
4. Goal difference

#### 📁 File Structure

```
EA-app/
├── index.html                 # Home page
├── leaderboard.html          # Player leaderboard
├── game_weeks.html           # Phase matrix view
├── crearCuenta.html          # Account creation
├── js/
│   ├── firebase-config.js    # Firebase configuration
│   ├── calculations.js       # Scoring logic
│   ├── tournament-config.js  # World Cup 2026 configuration
│   └── ui-helpers.js         # Shared UI components
├── css/
│   ├── styles_final.css      # Main consolidated styles
│   ├── styles2.css           # Legacy styles
│   └── icon/favicon-ball.ico
├── firebase-uploader/        # Logo upload utility
├── firebase.json             # Firebase config
├── .firebaserc               # Firebase project reference
└── .gitignore                # Ignored files
```

#### 🎨 UI/UX Highlights

- **Dark Theme**: Professional, eye-friendly dark interface with teal accents
- **Event Delegation**: Efficient click handling for player history modals
- **Data Normalization**: Handles both uppercase and lowercase Firestore property names
- **Responsive**: Mobile-friendly design with Bootstrap
- **Real-time**: Live data updates from Firestore
- **Modal System**: Reusable player history modal component

#### 🧪 Testing

All core functionality is tested through the Firestore database integration. The application validates:
- Scoring calculations with various prediction scenarios
- Player statistics aggregation
- Leaderboard accuracy

For local testing, use your browser's DevTools console to verify:
- Firebase connectivity
- Data loading from Firestore
- Player history modal functionality

#### 🚀 Deployment

The application is deployed on **Firebase Hosting** and automatically updates when changes are pushed.

**To Deploy:**
```bash
# Ensure you have Firebase CLI installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

**Deployment includes:**
- All HTML pages with responsive design
- Modularized JavaScript (ES modules)
- Consolidated CSS styling
- All assets and images
- Firebase configuration for authentication and Firestore access

**Current Deployment:**
🔗 **https://ea-football-predictor.web.app**

To view deployment logs and history:
```bash
firebase hosting:channel:list
firebase open hosting:site
```

#### 📝 Notes for Developers

- **Player IDs**: Uses Firebase UID instead of player names for reliable data tracking
- **Phases Won**: Calculates by comparing each player's score against ALL players' scores for that phase
- **Firebase Modules**: Uses ES Module imports (modern approach, requires local server)
- **Data Normalization**: `calculations.js` handles both `HomeScore`/`homeScore` property names

#### 📄 License

This project is open source and available under the MIT License.
