export const DEFAULT_START_TIME = "08:00";
export const DEFAULT_END_TIME = "14:00";

/** Full calendar-day span in the admin UI maps to DB `allDay: true` for listing display. */
export function isFullDayTimeRange(startTime?: string, endTime?: string): boolean {
  return startTime === "00:00" && endTime === "23:59";
}

export function buildTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const labelHour = hour % 12 || 12;
      const labelMinute = String(minute).padStart(2, "0");
      const period = hour >= 12 ? "PM" : "AM";
      options.push({ value, label: `${labelHour}:${labelMinute} ${period}` });
    }
  }
  const pivot = options.findIndex((opt) => opt.value === DEFAULT_START_TIME);
  if (pivot <= 0) return options;
  return [...options.slice(pivot), ...options.slice(0, pivot)];
}

export const TIME_OPTIONS = buildTimeOptions();

export type ScheduleDayInput = {
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
};

/**
 * Derives `allDay` for the API. When a day has explicit times, they are
 * authoritative (a partial-day span clears allDay, a midnight-11:59 PM span sets
 * it). When a day has no times (e.g. an all-day recurring day), the explicit
 * allDay flag is preserved.
 */
export function mapScheduleDaysForSubmit(days: ScheduleDayInput[]): ScheduleDayInput[] {
  return days.map((d) => ({
    ...d,
    allDay: d.startTime ? isFullDayTimeRange(d.startTime, d.endTime) : d.allDay,
  }));
}
