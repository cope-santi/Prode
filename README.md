# Prode Mundial 2026

Una web app ligera para hacer un prode exclusivo del FIFA World Cup 2026 con Firebase como backend único.

## Funcionalidades

* **Autenticación segura** con Firebase Auth (email/contraseña) antes de subir predicciones.
* **Carga de predicciones** para cada partido del Mundial y validación inmediata de puntajes en Firestore.
* **Visualización de fases** (grupos, octavos, cuartos, semis, tercer puesto y final) vía matrix y filtros de fase.
* **Leaderboard centralizado** con puntos totales, fases ganadas y predicciones perfectas; clic para abrir historial detallado.
* **Modal de historial** con predicciones + estadísticas calculadas a partir de todos los jugadores.
* **Dashboard de admin** (solo para el UID configurado) para añadir/actualizar partidos del Mundial 2026.

## Arquitectura

* `index.html` – landing principal con lista de partidos, formulario de predicción y vista del usuario autenticado.
* `leaderboard.html` – tabla ordenada y modal para revisar la historia de cada jugador.
* `game_weeks.html` – matriz por fase con colores según puntaje y toggle para mostrar predicciones tras el inicio.
* `fixtures.html` – listado de juegos filtrable por fase (mantiene orden cronológico en cliente).
* `js/firebase-config.js` – única fuente de la configuración Firebase del proyecto actual.
* `js/tournament-config.js` – define `tournamentId: "FIFA2026"` y los nombres/etapas del Mundial.
* `js/calculations.js` – lógica compartida de puntajes, estadísticas y normalización centrada en los campos definitivos.
* `js/ui-helpers.js` – modales, tablas y selectores reutilizados por las vistas.
* `js/admin-panel.js` – manejo del formulario del administrador con validaciones y envíos a Firestore.

## Firebase (Firestore + Auth)

1. Crea un nuevo proyecto en [console.firebase.google.com](https://console.firebase.google.com/).
2. Habilita **Firestore** (modo producción o test según tu preferencia) y crea las colecciones descritas más abajo.
3. Activa **Firebase Authentication** con el proveedor Email/Password.
4. Copia la configuración (apiKey, projectId, etc.) en `js/firebase-config.js`.
5. Ajusta las reglas para permitir lecturas de `games` y `predictions` a usuarios autenticados (o con reglas más abiertas si querés leaderboard público).
6. Opcional: habilita Firebase Hosting y despliega con `firebase deploy --only hosting`.

### Índices recomendados

* `games` – índice compuesto `tournamentId` + `KickOffTime` (para orden cronológico + filtrado único).
* `predictions` – índice compuesto `tournamentId` + `timestamp` (ayuda a ordenar la historia de cada usuario).

## Esquema mínimo de Firestore

### `games`

* `HomeTeam` (string)
* `AwayTeam` (string)
* `HomeScore`, `AwayScore` (number o `null`)
* `Status` (`upcoming` | `live` | `finished`)
* `KickOffTime` (ISO string)
* `Stage` (`GROUP`, `R32`, `R16`, `QF`, `SF`, `3P`, `FINAL`)
* `Group` (A–L, solo para fase de grupos)
* `Matchday` (1–3, solo para fase de grupos)
* `StageKey` (`GROUP-A-MD1`, `R16`, etc.)
* `tournamentId: "FIFA2026"`

### `predictions`

* `userId` (Firebase UID)
* `playerName` (cadena)
* `gameId` (referencia indirecta al doc de `games`)
* `predictedHomeScore`, `predictedAwayScore`
* `timestamp` (Fecha, se usa para ordenar el historial)
* `tournamentId: "FIFA2026"`

### `teams` (opcional)

* `name` (string)
* `logoUrl` (string) – usado en `fixtures.html`, `game_weeks.html` e `index.html`.

### `users` (opcional)

* Documentos de perfil si necesitás guardar status extra, aunque hoy todas las referencias usan sólo `userId`.

## Cómo correr en local

1. Abre terminal y ejecuta `python -m http.server` o `npx serve`.
2. Accede por `http://localhost:8000/index.html` (o la página deseada) usando un navegador moderno con soporte ES Modules.
3. Activa Firebase Auth en la app desde el panel de login; el administrador debe tener el UID definido en `admin.html`/`index.html`.

## Despliegue

1. Instala Firebase CLI (`npm install -g firebase-tools`) si no lo tenés.
2. Logueate (`firebase login`) y selecciona el proyecto correcto (`firebase use`).
3. Despliega con `firebase deploy --only hosting`.

> La aplicación es exclusivamente un prode del FIFA World Cup 2026. No hay lógica multi-torneo ni dropdowns de liga: todo se fija en ese campeonato.
