const assert = require("node:assert");
const { mapEventToGame } = require("../mapper");

const finishedEvent = {
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

const mappedFinished = mapEventToGame(finishedEvent);
assert.equal(mappedFinished.externalMatchId, "123");
assert.equal(mappedFinished.HomeTeam, "Argentina");
assert.equal(mappedFinished.AwayTeam, "Brazil");
assert.equal(mappedFinished.status, "finished");
assert.equal(mappedFinished.Status, undefined);
assert.equal(mappedFinished.providerStatus, "FINISHED");
assert.equal(mappedFinished.HomeScore, 2);
assert.equal(mappedFinished.AwayScore, 1);
assert.equal(mappedFinished.Stage, "GROUP");
assert.equal(mappedFinished.Group, "A");
assert.equal(mappedFinished.Matchday, 1);
assert.equal(mappedFinished.StageKey, "GROUP-A-MD1");
assert.ok(mappedFinished.utcDate && mappedFinished.utcDate.includes("2026-06-10"));

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

const mappedUpcoming = mapEventToGame(upcomingEvent);
assert.equal(mappedUpcoming.status, "upcoming");
assert.equal(mappedUpcoming.Status, undefined);
assert.equal(mappedUpcoming.providerStatus, "SCHEDULED");
assert.equal(mappedUpcoming.HomeScore, null);
assert.equal(mappedUpcoming.AwayScore, null);
assert.equal(mappedUpcoming.StageKey, "GROUP-B-MD2");

const r32Event = {
  idEvent: "789",
  strHomeTeam: "Mexico",
  strAwayTeam: "Japan",
  dateEvent: "2026-07-01",
  strTime: "18:00:00",
  strStatus: "Not Started",
  intHomeScore: null,
  intAwayScore: null,
  intRound: "32"
};

const mappedR32 = mapEventToGame(r32Event);
assert.equal(mappedR32.Stage, "R32");
assert.equal(mappedR32.Group, null);
assert.equal(mappedR32.Matchday, null);
assert.equal(mappedR32.StageKey, "R32");

const aetEvent = {
  ...r32Event,
  idEvent: "790",
  strStatus: "AET",
  intHomeScore: "1",
  intAwayScore: "0"
};
const mappedAet = mapEventToGame(aetEvent);
assert.equal(mappedAet.status, "finished");
assert.equal(mappedAet.providerStatus, "FINISHED");

const penaltiesEvent = {
  ...r32Event,
  idEvent: "791",
  strStatus: "PEN",
  intHomeScore: "1",
  intAwayScore: "1"
};
const mappedPenalties = mapEventToGame(penaltiesEvent);
assert.equal(mappedPenalties.status, "finished");
assert.equal(mappedPenalties.providerStatus, "FINISHED");

const invalidGroupEvent = {
  idEvent: "999",
  strHomeTeam: "Spain",
  strAwayTeam: "France",
  dateEvent: "2026-06-15",
  strTime: "18:00:00",
  strStatus: "Not Started",
  strRound: "Group 1 - Matchday 1",
  strGroup: "1",
  intRound: ""
};

const mappedInvalidGroup = mapEventToGame(invalidGroupEvent);
assert.equal(mappedInvalidGroup.Group, null);
assert.equal(mappedInvalidGroup.StageKey, null);

console.log("TheSportsDB mapper tests passed.");
