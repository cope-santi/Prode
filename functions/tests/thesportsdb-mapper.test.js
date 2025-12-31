const assert = require("node:assert");
const { mapMatchToGame } = require("../src/sync/mappers");

const sampleEvent = {
  idEvent: "123",
  strHomeTeam: "Argentina",
  strAwayTeam: "Brazil",
  dateEvent: "2026-06-10",
  strTime: "18:00:00",
  strStatus: "Match Finished",
  intHomeScore: "2",
  intAwayScore: "1",
  strRound: "Group A - Matchday 1",
  strGroup: "Group A",
  intRound: "1"
};

const mapped = mapMatchToGame(sampleEvent, "thesportsdb");

assert.equal(mapped.externalMatchId, "123");
assert.equal(mapped.HomeTeam, "Argentina");
assert.equal(mapped.AwayTeam, "Brazil");
assert.equal(mapped.status, "FINISHED");
assert.equal(mapped.Status, "finished");
assert.equal(mapped.HomeScore, 2);
assert.equal(mapped.AwayScore, 1);
assert.equal(mapped.Stage, "GROUP");
assert.equal(mapped.Group, "A");
assert.equal(mapped.Matchday, 1);
assert.equal(mapped.StageKey, "GROUP-A-MD1");
assert.ok(mapped.utcDate && mapped.utcDate.includes("2026-06-10"));

const upcomingEvent = {
  idEvent: "456",
  strHomeTeam: "USA",
  strAwayTeam: "Canada",
  dateEvent: "2026-06-12",
  strTime: "20:00:00",
  strStatus: "Not Started",
  intHomeScore: null,
  intAwayScore: null,
  strRound: "Group B - Matchday 2",
  strGroup: "Group B",
  intRound: "2"
};

const upcomingMapped = mapMatchToGame(upcomingEvent, "thesportsdb");
assert.equal(upcomingMapped.status, "SCHEDULED");
assert.equal(upcomingMapped.Status, "upcoming");
assert.equal(upcomingMapped.HomeScore, null);
assert.equal(upcomingMapped.AwayScore, null);
assert.equal(upcomingMapped.StageKey, "GROUP-B-MD2");

console.log("TheSportsDB mapper tests passed.");
