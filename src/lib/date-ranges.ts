/**
 * Shared date range helpers for home page sections and event filtering.
 */

/** Returns the upcoming weekend (Saturday–Sunday) date range. */
export function getUpcomingWeekendRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();

  const start = new Date(now);
  if (day === 0) {
    start.setDate(now.getDate());
    start.setHours(0, 0, 0, 0);
  } else if (day === 6) {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(now.getDate() + (6 - day));
    start.setHours(0, 0, 0, 0);
  }

  const end = new Date(start);
  // Inclusive end of the weekend is Sunday: from a Saturday start that is +1
  // day; from a Sunday start (today is Sunday) it is the same day (+0).
  end.setDate(start.getDate() + (start.getDay() === 6 ? 1 : 0));
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/** Returns the next 7 days (today through 6 days from now). */
export function getUpcomingWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Returns the Plan in Advance range: events 14–28 days from today. */
export function getPlanAheadRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() + 14);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
