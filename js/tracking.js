// 30-day activity log — localStorage only, rolling window, no backend.

const LOG_KEY = "mitra.tracking.log";
const WINDOW_DAYS = 30;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLog(log) {
  const cutoff = Date.now() - WINDOW_DAYS * 86400000;
  const pruned = log.filter(e => new Date(e.date).getTime() >= cutoff);
  localStorage.setItem(LOG_KEY, JSON.stringify(pruned));
  return pruned;
}

/** Seed a few demo days so Progress isn't empty on stage. */
export function seedDemoIfEmpty() {
  const log = loadLog();
  if (log.length > 0) return;
  const exercises = ["Arm Raises", "Elbow Curls", "Overhead Reach", "Side Bends"];
  const seeded = [];
  for (let d = 6; d >= 1; d--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    const date = dt.toISOString().slice(0, 10);
    if (d % 2 === 0) {
      seeded.push({
        date,
        exerciseType: exercises[d % exercises.length],
        targetReps: 10,
        repsCompleted: 6 + (d % 4),
        romEstimate: 38 + d * 3,
        formScore: null,
        durationSec: 180 + d * 20,
        sosEventFlag: false,
      });
    }
  }
  saveLog(seeded);
}

export function logSession({ exerciseType, repsCompleted, romEstimate, formScore, durationSec, targetReps = 10 }) {
  const log = loadLog();
  log.push({
    date: todayISO(),
    exerciseType,
    targetReps,
    repsCompleted,
    romEstimate: Math.round(romEstimate || 0),
    formScore: formScore ?? null,
    durationSec: Math.round(durationSec || 0),
    sosEventFlag: false,
  });
  return saveLog(log);
}

export function logSOSEvent() {
  const log = loadLog();
  log.push({
    date: todayISO(),
    exerciseType: "SOS",
    targetReps: 0,
    repsCompleted: 0,
    romEstimate: 0,
    formScore: null,
    durationSec: 0,
    sosEventFlag: true,
  });
  return saveLog(log);
}

export function getEntries(days = WINDOW_DAYS) {
  const cutoff = Date.now() - days * 86400000;
  return loadLog().filter(e => new Date(e.date).getTime() >= cutoff);
}

/** Map date → total reps (exercise sessions only). */
export function getHeatmapData() {
  const map = {};
  for (const e of getEntries()) {
    if (e.sosEventFlag) continue;
    map[e.date] = (map[e.date] || 0) + (e.repsCompleted || 0);
  }
  return map;
}

/** Sessions with ROM for trend line. */
export function getRomTrend() {
  return getEntries()
    .filter(e => !e.sosEventFlag && e.romEstimate > 0)
    .map(e => ({ date: e.date, rom: e.romEstimate, exercise: e.exerciseType }));
}

export function getWeeklySummary() {
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const thisWeek = getEntries().filter(e => {
    if (e.sosEventFlag) return false;
    return now - new Date(e.date).getTime() < weekMs;
  });
  const lastWeek = loadLog().filter(e => {
    if (e.sosEventFlag) return false;
    const t = new Date(e.date).getTime();
    return now - t >= weekMs && now - t < weekMs * 2;
  });
  const sessions = thisWeek.length;
  const reps = thisWeek.reduce((s, e) => s + (e.repsCompleted || 0), 0);
  const prevSessions = lastWeek.length;
  const sosCount = getEntries().filter(e => e.sosEventFlag).length;
  return { sessions, reps, prevSessions, sosCount };
}

export function buildWeeklySpeech() {
  const { sessions, reps, prevSessions } = getWeeklySummary();
  if (sessions === 0) {
    return "You have not logged any exercise sessions this week yet. Whenever you are ready, we can start together.";
  }
  const cmp = prevSessions > 0
    ? sessions >= prevSessions
      ? `up from ${prevSessions} last week`
      : `a little less than ${prevSessions} last week, and that is perfectly fine`
    : "a great start";
  return `This week you did ${sessions} session${sessions === 1 ? "" : "s"} and ${reps} repetitions — ${cmp}. I am proud of you.`;
}

export function exportCSV() {
  const rows = [["date", "exerciseType", "targetReps", "repsCompleted", "romEstimate", "formScore", "durationSec", "sosEvent"]];
  for (const e of getEntries()) {
    rows.push([
      e.date, e.exerciseType, e.targetReps, e.repsCompleted,
      e.romEstimate, e.formScore ?? "", e.durationSec, e.sosEventFlag ? "yes" : "no",
    ]);
  }
  return rows.map(r => r.join(",")).join("\n");
}

export function exportPlainText() {
  const lines = ["Mitra — 30-day activity log", ""];
  for (const e of getEntries()) {
    if (e.sosEventFlag) {
      lines.push(`${e.date}: SOS alert`);
    } else {
      lines.push(`${e.date}: ${e.exerciseType} — ${e.repsCompleted} reps, ROM ~${e.romEstimate}°, ${e.durationSec}s`);
    }
  }
  return lines.join("\n");
}
