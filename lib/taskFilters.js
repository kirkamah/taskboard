// Per-user view filters for the board. State lives in localStorage — each user
// has their own filters per board, not visible to anyone else. Filters are pure
// view state (hide, not delete) and can be cleared at any time.
//
// Filter shape:
//   assignee: null | 'me' | 'unassigned' | <userId>        (room only; personal ignores)
//   tagIds:   []    // if non-empty, show tasks that have AT LEAST ONE of these tags
//   noTags:   false // if true, show only tasks with no tags (wins over tagIds)
//   due:      null | 'overdue' | 'today' | 'week' | 'none' | 'any'
//   quadrant: null | 'do' | 'plan' | 'delegate' | 'drop'

export const DEFAULT_FILTERS = {
  assignee: null,
  tagIds: [],
  noTags: false,
  due: null,
  quadrant: null,
};

const QUADRANT_MAP = {
  do: { important: true, urgent: true },
  plan: { important: true, urgent: false },
  delegate: { important: false, urgent: true },
  drop: { important: false, urgent: false },
};

// Local day boundaries — "today" means the user's current calendar day.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
function endOfWeek() {
  // "Within next 7 days" — simpler and more useful than ISO-week edges.
  return Date.now() + 7 * 24 * 60 * 60 * 1000;
}

function matchesDue(task, due) {
  if (!due) return true;
  const has = !!task.due_at;
  if (due === 'none') return !has;
  if (due === 'any') return has;
  if (!has) return false;
  const t = new Date(task.due_at).getTime();
  if (Number.isNaN(t)) return false;
  if (due === 'overdue') return t < Date.now();
  if (due === 'today') return t >= startOfToday() && t <= endOfToday();
  if (due === 'week') return t >= Date.now() && t <= endOfWeek();
  return true;
}

function matchesAssignee(task, assignee, userId) {
  if (!assignee) return true;
  const list = task.assignees || [];
  if (assignee === 'me') return list.includes(userId);
  if (assignee === 'unassigned') return list.length === 0;
  return list.includes(assignee);
}

function matchesTags(task, tagIds, noTags) {
  const list = task.tagIds || [];
  if (noTags) return list.length === 0;
  if (!tagIds || tagIds.length === 0) return true;
  return tagIds.some((id) => list.includes(id));
}

function matchesQuadrant(task, quadrant) {
  if (!quadrant) return true;
  const m = QUADRANT_MAP[quadrant];
  if (!m) return true;
  return task.important === m.important && task.urgent === m.urgent;
}

export function applyFilters(tasks, filters, userId) {
  if (!filters) return tasks;
  return tasks.filter((t) =>
    matchesAssignee(t, filters.assignee, userId) &&
    matchesTags(t, filters.tagIds, filters.noTags) &&
    matchesDue(t, filters.due) &&
    matchesQuadrant(t, filters.quadrant)
  );
}

export function countActiveFilters(filters) {
  if (!filters) return 0;
  let n = 0;
  if (filters.assignee) n++;
  if (filters.noTags || (filters.tagIds && filters.tagIds.length > 0)) n++;
  if (filters.due) n++;
  if (filters.quadrant) n++;
  return n;
}

export function hasActiveFilters(filters) {
  return countActiveFilters(filters) > 0;
}

// Storage key is namespaced by scope so room/personal preferences stay separate.
// Versioned so future shape migrations can invalidate old entries.
export function filterStorageKey(scope, id) {
  return `taskboard:filters:v1:${scope}:${id || 'self'}`;
}

export function loadFilters(scope, id) {
  if (typeof window === 'undefined') return { ...DEFAULT_FILTERS };
  try {
    const raw = window.localStorage.getItem(filterStorageKey(scope, id));
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_FILTERS, ...parsed, tagIds: Array.isArray(parsed.tagIds) ? parsed.tagIds : [] };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

export function saveFilters(scope, id, filters) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(filterStorageKey(scope, id), JSON.stringify(filters));
  } catch {
    // Quota or private-mode — ignore; filters just won't persist this session.
  }
}
