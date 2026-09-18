/**
 * Optional playtest event context. No storage, identifiers, timers or network calls.
 * Existing device analytics consent is the sole gate; unfinished, pre-consent
 * rounds are never reconstructed when permission changes.
 */
const EVENTS = new Set(['check', 'hint', 'complete', 'next_case', 'case_open', 'share']);
const ENTRIES = new Set(['initial', 'next', 'replay', 'casebook', 'daily', 'continue']);
const MODES = new Set(['daily', 'practice', 'challenge']);
const OUTCOMES = new Set(['solved', 'assisted', 'revealed']);

function caseId(value) {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 80
    ? value : null;
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? Math.min(value, 999) : undefined;
}

function eventDetails(event, extra) {
  const result = {};
  if (event === 'check' || event === 'complete') {
    const attempts = count(extra.attempts);
    if (attempts !== undefined) result.attempts = attempts;
  }
  if (event === 'hint' || event === 'complete') {
    const hints = count(extra.hints_used);
    if (hints !== undefined) result.hints_used = hints;
  }
  if (event === 'check' && typeof extra.correct === 'boolean') result.correct = extra.correct;
  if (event === 'complete' && OUTCOMES.has(extra.outcome)) result.outcome = extra.outcome;
  if ((event === 'next_case' || event === 'case_open') && caseId(extra.destination_case_id)) {
    result.destination_case_id = extra.destination_case_id;
  }
  if (event === 'share' && ['native', 'copy'].includes(extra.method)) result.method = extra.method;
  return result;
}

export function createAkshifhaStudy({ allowed = () => false, send = () => {} } = {}) {
  let observedRounds = 0;
  let current = null;
  const openedCases = new Set();

  function reset() {
    observedRounds = 0;
    current = null;
    openedCases.clear();
  }

  function permitted() {
    try {
      if (allowed() === true) return true;
    } catch { /* Unavailable privacy controls default to no measurement. */ }
    reset();
    return false;
  }

  function emit(event, details = {}) {
    if (!permitted() || !current) return false;
    try {
      send(`akshifha_${event}`, { ...current.params, ...details });
      return true;
    } catch { return false; } // Analytics failure must never interrupt play.
  }

  function open({
    caseId: id, gameMode, language, entry = 'initial', completedBefore = false,
    priorCompletions = 0, progressAvailable = true,
  } = {}) {
    if (!permitted()) return false;
    if (!caseId(id) || !MODES.has(gameMode) || !['en', 'ar'].includes(language) || !ENTRIES.has(entry)) {
      current = null;
      return false;
    }
    const previous = current;
    const seen = openedCases.has(id);
    const history = completedBefore === true ? 'completed'
      : seen ? 'opened_this_page'
        : progressAvailable === true ? 'no_saved_completion' : 'unavailable';
    let kind = 'other_case';
    if (entry === 'replay' || completedBefore === true || seen) kind = 'replay';
    else if (entry === 'initial') kind = 'first_case';
    else if (entry === 'next' && previous?.completed) {
      kind = progressAvailable === true ? 'next_uncompleted' : 'next_history_unknown';
    }
    observedRounds += 1;
    current = {
      completed: false,
      engaged: false,
      params: {
        measurement_version: 1,
        case_id: id,
        game_mode: gameMode,
        language,
        entry_point: entry,
        round_kind: kind,
        case_history: history,
        prior_progress: progressAvailable !== true ? 'unavailable'
          : count(priorCompletions) > 0 ? 'present' : 'none',
        observed_round_index: observedRounds,
        first_page_case: entry === 'initial',
        after_first_completion: entry === 'next' && previous?.completed === true
          && previous.params.first_page_case === true,
      },
    };
    openedCases.add(id);
    return emit('start');
  }

  function track(event, extra = {}) {
    if (!permitted() || !current || !EVENTS.has(event)) return false;
    if (event === 'complete' && current.completed) return false;
    const round = current;
    if (!current.engaged && ['check', 'hint', 'complete'].includes(event)) {
      current.engaged = true;
      emit('engage');
    }
    if (current !== round) return false;
    if (event === 'complete') current.completed = true;
    return emit(event, eventDetails(event, extra || {}));
  }

  return Object.freeze({ open, track, reset });
}
