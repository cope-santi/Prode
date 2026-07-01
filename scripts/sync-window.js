#!/usr/bin/env node

const fs = require("node:fs");

const MATCH_KICKOFFS_UTC = [
  "2026-07-01T01:00:00Z",
  "2026-07-01T16:00:00Z",
  "2026-07-01T20:00:00Z",
  "2026-07-02T00:00:00Z",
  "2026-07-02T19:00:00Z",
  "2026-07-02T23:00:00Z",
  "2026-07-03T03:00:00Z",
  "2026-07-03T18:00:00Z",
  "2026-07-03T22:00:00Z",
  "2026-07-04T01:30:00Z"
];

const SYNC_OFFSETS_MINUTES = [
  -10, // one check before kickoff
  10,
  20, // publish predictions shortly after kickoff
  130,
  150,
  180 // retry after the expected full-time/result window
];

const WINDOW_TOLERANCE_MINUTES = 6;

function getSyncWindows() {
  return MATCH_KICKOFFS_UTC.flatMap(kickoff => {
    const kickoffMs = Date.parse(kickoff);
    return SYNC_OFFSETS_MINUTES.map(offset => ({
      kickoff,
      offset,
      atMs: kickoffMs + offset * 60 * 1000
    }));
  });
}

function findMatchingWindow(now = new Date()) {
  const nowMs = now.getTime();
  const toleranceMs = WINDOW_TOLERANCE_MINUTES * 60 * 1000;
  return getSyncWindows().find(window => Math.abs(nowMs - window.atMs) <= toleranceMs) || null;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const nowArg = process.env.SYNC_WINDOW_NOW || null;
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid SYNC_WINDOW_NOW: ${nowArg}`);
  }

  const isManual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch" && !args.has("--scheduled-only");
  const match = findMatchingWindow(now);
  const shouldRun = isManual || !!match;
  const reason = isManual
    ? "manual"
    : match
      ? `${match.kickoff} offset ${match.offset}m`
      : "outside scheduled match windows";

  if (args.has("--github-output") && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `should_run=${shouldRun}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `reason=${reason}\n`);
  }

  if (!args.has("--quiet")) {
    console.log(`UTC ${now.toISOString()} should_run=${shouldRun} reason=${reason}`);
  }

  process.exit(shouldRun ? 0 : 2);
}

if (require.main === module) {
  main();
}

module.exports = {
  MATCH_KICKOFFS_UTC,
  SYNC_OFFSETS_MINUTES,
  WINDOW_TOLERANCE_MINUTES,
  findMatchingWindow,
  getSyncWindows
};
