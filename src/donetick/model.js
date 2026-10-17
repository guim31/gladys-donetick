// -----------------------------------------------------------------------------
// From the raw Donetick answers to what Gladys shows: chores with a due time
// in milliseconds, members with a display name, completed history entries,
// and the counters of a local day (the time zone of Gladys, injected by the
// supervisor as TZ).
//
// Definitions, the same in the devices, the widget and the documentation:
//   - overdue: an active chore whose due time has passed;
//   - to do today: an active chore due before the end of the local day,
//     overdue ones included ("what is left to do by tonight");
//   - done today: completions recorded during the local day (history status
//     1; skipped, pending approval, rejected… are not completions);
//   - next chore: the active chore with the earliest due time, overdue first.
// Chores without a due date count in none of them.
// -----------------------------------------------------------------------------

export const HISTORY_COMPLETED = 1;
export const HISTORY_PENDING_APPROVAL = 3;
// `status` of a chore whose completion waits for an admin.
export const CHORE_PENDING_APPROVAL = 3;

const time = (value) => {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * @param {unknown[]} raw `res` of GET /api/v1/chores/
 * @returns {Array<{ id: number, name: string, dueAt: number|null, assignedTo: number|null,
 *   frequencyType: string, requireApproval: boolean, pendingApproval: boolean }>}
 */
export function parseChores(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((chore) => chore && Number.isInteger(chore.id) && chore.isActive !== false)
    .map((chore) => ({
      id: chore.id,
      name:
        typeof chore.name === 'string' && chore.name.trim() ? chore.name.trim() : `#${chore.id}`,
      dueAt: time(chore.nextDueDate),
      assignedTo:
        Number.isInteger(chore.assignedTo) && chore.assignedTo > 0 ? chore.assignedTo : null,
      frequencyType: typeof chore.frequencyType === 'string' ? chore.frequencyType : '',
      requireApproval: chore.requireApproval === true,
      pendingApproval: chore.status === CHORE_PENDING_APPROVAL,
    }))
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.id - b.id);
}

/**
 * @param {unknown[]} raw `res` of GET /api/v1/circles/members
 * @returns {Array<{ userId: number, circleId: number|null, name: string }>}
 */
export function parseMembers(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((member) => member && Number.isInteger(member.userId) && member.isActive !== false)
    .map((member) => ({
      userId: member.userId,
      circleId: Number.isInteger(member.circleId) ? member.circleId : null,
      name:
        (typeof member.displayName === 'string' && member.displayName.trim()) ||
        (typeof member.username === 'string' && member.username.trim()) ||
        `#${member.userId}`,
    }))
    .sort((a, b) => a.userId - b.userId);
}

/**
 * Completed entries, and those waiting for approval (an approval turns the
 * same entry, same id, into a completed one).
 * @param {unknown[]} raw `res` of GET /api/v1/chores/history
 * @returns {Array<{ id: number, choreId: number, status: number, completedBy: number|null,
 *   performedAt: number|null, dueAt: number|null }>}
 */
export function parseHistory(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(
      (entry) =>
        entry &&
        Number.isInteger(entry.id) &&
        (entry.status === HISTORY_COMPLETED || entry.status === HISTORY_PENDING_APPROVAL),
    )
    .map((entry) => ({
      id: entry.id,
      choreId: Number.isInteger(entry.choreId) ? entry.choreId : null,
      status: entry.status,
      completedBy: Number.isInteger(entry.completedBy) ? entry.completedBy : null,
      performedAt: time(entry.performedAt),
      dueAt: time(entry.dueDate),
    }))
    .sort((a, b) => a.id - b.id);
}

// --- Local days -------------------------------------------------------------------

const partsFormatters = new Map();

function zonedParts(ms, timeZone) {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]),
  );
  return parts;
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of local midnight of a local calendar day (DST-safe). */
function localMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  let start = guess - offsetAt(first, timeZone);
  // Where the clocks jump at midnight (Chile, Cuba), 00:00 does not exist and
  // the instant found is 23:00 the day before: the day starts an hour later.
  if (zonedParts(start, timeZone).day !== day) {
    start += 60 * 60_000;
  }
  return start;
}

/** A time zone Intl knows, else the one of the process. */
export function resolveTimeZone(timeZone) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Start and end (exclusive) of the local day holding `now`. */
export function localDay(now, timeZone) {
  const p = zonedParts(now, timeZone);
  const start = localMidnight(p.year, p.month, p.day, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = localMidnight(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { start, end };
}

// --- Counters ---------------------------------------------------------------------

/**
 * Counters of one day, for the whole circle (`userId` null) or one member.
 * @param {ReturnType<typeof parseChores>} chores
 * @param {ReturnType<typeof parseHistory>} history
 * @param {{ now: number, day: { start: number, end: number }, userId?: number|null }} options
 */
export function summarize(chores, history, { now, day, userId = null }) {
  const mine = userId === null ? chores : chores.filter((chore) => chore.assignedTo === userId);
  const dated = mine.filter((chore) => chore.dueAt !== null);
  const today = dated.filter((chore) => chore.dueAt < day.end);
  const done = history.filter(
    (entry) =>
      entry.status === HISTORY_COMPLETED &&
      entry.performedAt !== null &&
      entry.performedAt >= day.start &&
      entry.performedAt < day.end &&
      (userId === null || entry.completedBy === userId),
  );
  return {
    toDoToday: today.length,
    overdue: dated.filter((chore) => chore.dueAt < now).length,
    doneToday: done.length,
    next: dated[0] ?? null,
    today,
  };
}

/** Find a chore by its number (`12`, `#12`) or its name (case and accents ignored). */
export function findChore(chores, query) {
  const text = typeof query === 'number' ? String(query) : String(query ?? '').trim();
  if (!text) {
    return { chore: null, reason: 'empty' };
  }
  const number = text.match(/^#?(\d+)$/);
  if (number) {
    const chore = chores.find((item) => item.id === Number(number[1]));
    return chore ? { chore } : { chore: null, reason: 'not_found' };
  }
  const fold = (value) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const wanted = fold(text);
  const matches = chores.filter((item) => fold(item.name) === wanted);
  if (matches.length === 1) {
    return { chore: matches[0] };
  }
  return { chore: null, reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}
