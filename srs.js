// SRS (Spaced Repetition System) module — SM-2 algorithm
// Learning history is stored in localStorage under key "srs_cards"

const SRS_KEY = "srs_cards";

// Returns today's date string in YYYY-MM-DD format (local time).
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Adds `days` calendar days to a YYYY-MM-DD string.
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Load the full SRS map from localStorage.
// Returns a plain object: { [cardId]: SrsEntry }
function loadSrs() {
  try {
    return JSON.parse(localStorage.getItem(SRS_KEY) || "{}");
  } catch {
    return {};
  }
}

// Persist the SRS map to localStorage.
function saveSrs(map) {
  localStorage.setItem(SRS_KEY, JSON.stringify(map));
}

// Get or initialise an SRS entry for a card.
// SrsEntry = { interval, easeFactor, repetitions, nextReview, lastReview }
function getEntry(map, id) {
  return map[id] || {
    interval: 0,       // days until next review
    easeFactor: 2.5,   // SM-2 ease factor (min 1.3)
    repetitions: 0,    // consecutive correct answers
    nextReview: null,  // YYYY-MM-DD or null (never reviewed)
    lastReview: null,
  };
}

// Apply SM-2 update.
// quality: 0 = wrong ("あとで"), 5 = correct ("わかった")
// We map "わかった" → quality 4, "あとで" → quality 1.
function sm2Update(entry, quality) {
  const today = todayStr();
  let { interval, easeFactor, repetitions } = entry;

  if (quality >= 3) {
    // Correct answer
    if (repetitions === 0) {
      interval = 1;        // 1st correct: 1 day
    } else if (repetitions === 1) {
      interval = 3;        // 2nd correct: 3 days
    } else if (repetitions === 2) {
      interval = 7;        // 3rd correct: 7 days
    } else {
      // Subsequent: interval * easeFactor (rounded)
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Wrong answer — reset
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor (SM-2 formula)
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  return {
    interval,
    easeFactor,
    repetitions,
    nextReview: addDays(today, interval),
    lastReview: today,
  };
}

// Record a card answer.  quality: 1 (wrong) or 4 (correct).
function recordAnswer(id, quality) {
  const map = loadSrs();
  const entry = getEntry(map, id);
  map[id] = sm2Update(entry, quality);
  saveSrs(map);
}

// Returns true if a card is due for review today or is overdue.
function isDueToday(entry) {
  if (!entry.nextReview) return true; // never studied → always due
  return entry.nextReview <= todayStr();
}

// Count how many of the given cards are due today.
function countDueToday(cards) {
  const map = loadSrs();
  return cards.filter((c) => isDueToday(getEntry(map, c.id))).length;
}

// Filter cards to only those due today.
function filterDueToday(cards) {
  const map = loadSrs();
  return cards.filter((c) => isDueToday(getEntry(map, c.id)));
}

// Compute overall mastery percentage.
// A card is "mastered" if it has been answered correctly (repetitions >= 1)
// and its interval >= 7 days.
function masteryPercent(cards) {
  if (!cards.length) return 0;
  const map = loadSrs();
  const mastered = cards.filter((c) => {
    const e = getEntry(map, c.id);
    return e.repetitions >= 3 && e.interval >= 7;
  }).length;
  return Math.round((mastered / cards.length) * 100);
}

// Count cards reviewed today (lastReview === today).
function reviewedTodayCount(cards) {
  const today = todayStr();
  const map = loadSrs();
  return cards.filter((c) => getEntry(map, c.id).lastReview === today).length;
}

// Reset ALL SRS data.
function resetSrs() {
  localStorage.removeItem(SRS_KEY);
}

// Export to window so app.js can access.
window.SRS = {
  recordAnswer,
  isDueToday,
  countDueToday,
  filterDueToday,
  masteryPercent,
  reviewedTodayCount,
  resetSrs,
  getEntry,
  loadSrs,
};
