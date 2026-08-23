'use strict';

const CODES = ['D', 'E', 'N', 'X'];

// Forward-rotation only: a shift can never be followed by an "earlier" one.
// D -> E -> N -> (rest) -> D is fine; N -> D, N -> E, E -> D are not.
const FORBIDDEN_TRANSITIONS = new Set(['N>D', 'N>E', 'E>D']);

function isValidTransition(prev, next) {
  return !FORBIDDEN_TRANSITIONS.has(`${prev}>${next}`);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}

function dayIndexOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return (d.getDay() + 6) % 7; // Monday=0 .. Sunday=6
}

// Enumerate every 7-day pattern that: has exactly 5 shift-days + 2 X days,
// keeps D/E/N counts within the week balanced (max-min <= 1), never goes
// backward (N->D, N->E, E->D), and wraps safely into itself (day7->day1),
// so the same pattern can repeat week after week without a violation.
function buildPatternPool() {
  const pool = [];
  const seq = [];
  function recurse() {
    if (seq.length === 7) {
      const counts = { D: 0, E: 0, N: 0, X: 0 };
      seq.forEach((c) => counts[c]++);
      if (counts.X !== 2) return;
      const work = [counts.D, counts.E, counts.N];
      if (Math.max(...work) - Math.min(...work) > 1) return;
      if (!isValidTransition(seq[6], seq[0])) return;
      pool.push(seq.slice());
      return;
    }
    for (const code of CODES) {
      if (seq.length > 0 && !isValidTransition(seq[seq.length - 1], code)) continue;
      seq.push(code);
      recurse();
      seq.pop();
    }
  }
  recurse();
  return pool;
}

const PATTERN_POOL = buildPatternPool();

function coverageScoreOf(coverage, pattern) {
  // Rewards filling a (weekday, shift-type) slot that nothing covers yet;
  // diminishing reward for adding redundant coverage.
  let score = 0;
  for (let day = 0; day < 7; day++) {
    const code = pattern[day];
    if (code === 'X') continue;
    const covered = coverage[day][code];
    score += covered === 0 ? 3 : covered === 1 ? 1 : 0;
  }
  return score;
}

function countUncoveredSlots(chosen) {
  const coverage = Array.from({ length: 7 }, () => ({ D: 0, E: 0, N: 0 }));
  chosen.forEach((p) => p.forEach((code, day) => { if (code !== 'X') coverage[day][code]++; }));
  let uncovered = 0;
  for (let day = 0; day < 7; day++) {
    ['D', 'E', 'N'].forEach((t) => { if (coverage[day][t] === 0) uncovered++; });
  }
  return uncovered;
}

// Picks `count` patterns and orders them into a cycle where pattern[i]'s
// last day transitions validly into pattern[i+1]'s first day (wrapping too,
// so rotating a person through them week after week never needs a repair),
// while greedily choosing at each step whichever compatible pattern best
// fills in D/E/N coverage gaps across the 7 weekdays. Tries every starting
// pattern and keeps whichever full build leaves the fewest shifts uncovered.
function choosePatterns(count) {
  const n = Math.max(1, Math.min(count, PATTERN_POOL.length));

  function tryBuild(start) {
    const used = new Set([start]);
    const chosen = [PATTERN_POOL[start]];
    const coverage = Array.from({ length: 7 }, () => ({ D: 0, E: 0, N: 0 }));
    chosen[0].forEach((code, day) => { if (code !== 'X') coverage[day][code]++; });

    for (let step = 1; step < n; step++) {
      const prevLast = chosen[chosen.length - 1][6];
      let best = -1;
      let bestScore = -1;
      for (let idx = 0; idx < PATTERN_POOL.length; idx++) {
        if (used.has(idx)) continue;
        if (!isValidTransition(prevLast, PATTERN_POOL[idx][0])) continue;
        const score = coverageScoreOf(coverage, PATTERN_POOL[idx]);
        if (score > bestScore) { bestScore = score; best = idx; }
      }
      if (best === -1) return null;
      used.add(best);
      chosen.push(PATTERN_POOL[best]);
      PATTERN_POOL[best].forEach((code, day) => { if (code !== 'X') coverage[day][code]++; });
    }
    if (!isValidTransition(chosen[chosen.length - 1][6], chosen[0][0])) return null;
    return chosen;
  }

  let bestChosen = null;
  let bestUncovered = Infinity;
  for (let start = 0; start < PATTERN_POOL.length; start++) {
    const built = tryBuild(start);
    if (!built) continue;
    const uncovered = countUncoveredSlots(built);
    if (uncovered < bestUncovered) {
      bestUncovered = uncovered;
      bestChosen = built;
      if (uncovered === 0) break;
    }
  }
  if (bestChosen) return bestChosen;

  // Fallback (validateAndRepair still guarantees correctness downstream).
  const stride = Math.max(1, Math.floor(PATTERN_POOL.length / n));
  const chosen = [];
  for (let i = 0; i < n; i++) chosen.push(PATTERN_POOL[(i * stride) % PATTERN_POOL.length]);
  return chosen;
}

// Assigns each operator a pattern per calendar week, rotating the
// assignment every week so that, over several weeks, everyone cycles
// through every pattern — spreading D/E/N fairly across the team.
function generateDeterministicSchedule(people, dates) {
  const schedule = {};
  if (!people.length || !dates.length) return schedule;

  const sortedDates = [...dates].sort();
  const epochMonday = mondayOf(sortedDates[0]);
  const patterns = choosePatterns(people.length);

  sortedDates.forEach((date) => {
    schedule[date] = schedule[date] || {};
    const monday = mondayOf(date);
    const weekIndex = Math.round((monday - epochMonday) / (7 * 86400000));
    const dayIndex = dayIndexOf(date);

    people.forEach((person, i) => {
      const patternIndex = (i + weekIndex) % patterns.length;
      schedule[date][person] = patterns[patternIndex][dayIndex];
    });
  });

  return schedule;
}

// Safety net run on both deterministic and AI output: walk each operator's
// chronological codes and force any forbidden transition's later day to X.
function validateAndRepair(schedule, people, dates) {
  const sortedDates = [...dates].sort();
  const repairs = [];
  people.forEach((person) => {
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = sortedDates[i - 1];
      const curDate = sortedDates[i];
      const prev = schedule[prevDate]?.[person] || 'X';
      const cur = schedule[curDate]?.[person] || 'X';
      if (!isValidTransition(prev, cur)) {
        if (!schedule[curDate]) schedule[curDate] = {};
        schedule[curDate][person] = 'X';
        repairs.push(`${person}: ${prevDate}(${prev}) -> ${curDate}(${cur}) not allowed, forced to X`);
      }
    }
  });
  return repairs;
}

function computeStats(schedule, people, dates) {
  const stats = {};
  people.forEach((person) => {
    stats[person] = { D: 0, E: 0, N: 0, X: 0 };
  });
  dates.forEach((date) => {
    people.forEach((person) => {
      const code = schedule[date]?.[person] || 'X';
      if (stats[person][code] !== undefined) stats[person][code]++;
    });
  });
  return stats;
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isValidAiSchedule(parsed, people, dates) {
  if (!parsed || typeof parsed !== 'object' || !parsed.schedule || typeof parsed.schedule !== 'object') return false;
  for (const date of dates) {
    const row = parsed.schedule[date];
    if (!row || typeof row !== 'object') return false;
    for (const person of people) {
      if (!CODES.includes(row[person])) return false;
    }
  }
  return true;
}

const SYSTEM_PROMPT = `You are a precise shift-scheduling engine for a 24/7 SOC (Security Operations Center) team.

Shift codes: D = Day, E = Evening, N = Night, X = day off.

Hard rules — never violate these:
1. Forward rotation only. For each operator, across any two consecutive scheduled days, the shift can never move backward: N must never be followed by D or E; E must never be followed by D. (D->E, E->N, N->N, N->X, X->anything, D->D, D->N are all fine.)
2. Every calendar week (Monday-Sunday) inside the requested range, each operator must have exactly 5 shift-days (D/E/N combined) and exactly 2 X days.
3. Across the full requested date range, keep every operator's total D/E/N counts roughly equal to each other, and roughly equal across all operators — the workload must be fair.
4. Every single day, at least one operator must be on D, at least one on E, and at least one on N — the team can never leave a shift uncovered.

You will be given a list of operators, a list of dates, and a draft schedule that already satisfies rules 1 and 2. Adjust it only as needed to better satisfy rules 3 and 4; keep it unchanged wherever it is already fine. Do not violate rules 1 or 2 while doing so.

Respond with ONLY a single JSON object, no prose, no markdown code fences, no explanation — just the raw JSON, in exactly this shape:
{"schedule": {"<date>": {"<operator>": "D"|"E"|"N"|"X", ...for every operator}, ...for every requested date}}`;

async function callOpenRouter(people, dates, draftSchedule) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { schedule: null, error: 'OPENROUTER_API_KEY not configured' };

  const model = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dateLines = dates.map((d) => `${d} (${dayNames[dayIndexOf(d)]})`).join(', ');

  const userPrompt = `Operators: ${people.join(', ')}
Dates to schedule: ${dateLines}

Draft schedule (already valid for rules 1 and 2 — refine for rules 3 and 4):
${JSON.stringify(draftSchedule)}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { schedule: null, error: `OpenRouter ${res.status}: ${body.slice(0, 200)}`, model };
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  const parsed = extractJson(content);

  if (!isValidAiSchedule(parsed, people, dates)) {
    return { schedule: null, error: 'AI response did not match the expected schedule shape', model };
  }

  return { schedule: parsed.schedule, error: null, model };
}

async function autoGenerate(people, dates, { useAi = true } = {}) {
  const sortedDates = [...dates].sort();
  const draft = generateDeterministicSchedule(people, sortedDates);
  validateAndRepair(draft, people, sortedDates);

  let schedule = draft;
  let source = 'deterministic';
  let note = null;

  if (useAi && process.env.OPENROUTER_API_KEY) {
    const ai = await callOpenRouter(people, sortedDates, draft);
    if (ai.schedule) {
      schedule = ai.schedule;
      source = `openrouter:${ai.model}`;
    } else {
      note = `AI generation unavailable (${ai.error}); used deterministic fallback.`;
    }
  } else if (useAi) {
    note = 'OPENROUTER_API_KEY not set; used deterministic fallback.';
  }

  const repairs = validateAndRepair(schedule, people, sortedDates);
  const stats = computeStats(schedule, people, sortedDates);

  return { schedule, source, note, repairs, stats };
}

module.exports = {
  isValidTransition,
  isoLocal,
  dayIndexOf,
  generateDeterministicSchedule,
  validateAndRepair,
  computeStats,
  autoGenerate,
  PATTERN_POOL
};
