-- Gives every event without schedule days one day per Pacific calendar date from its start to its end.
-- When the Pacific start time is earlier than the end time, every day gets those hours. Otherwise the
-- first day runs from the start time, the last day ends at the end time, and the days between are all
-- day. Spans longer than seven days are left alone because their recurrence (weekly, monthly) cannot
-- be inferred from the date range.
WITH bounds AS (
  SELECT
    e."id",
    ((e."startDate" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles') AS local_start,
    ((e."endDate" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles') AS local_end
  FROM "events" e
  WHERE NOT EXISTS (SELECT 1 FROM "event_schedule_days" s WHERE s."eventId" = e."id")
),
days AS (
  SELECT
    b."id",
    d.day::date AS day,
    b.local_start::date AS first_day,
    b.local_end::date AS last_day,
    to_char(b.local_start, 'HH24:MI') AS start_time,
    to_char(b.local_end, 'HH24:MI') AS end_time
  FROM bounds b
  CROSS JOIN LATERAL generate_series(b.local_start::date, b.local_end::date, interval '1 day') AS d(day)
  WHERE b.local_end::date - b.local_start::date BETWEEN 0 AND 6
)
INSERT INTO "event_schedule_days" ("id", "eventId", "date", "startTime", "endTime", "allDay")
SELECT
  'bf' || md5("id" || day::text),
  "id",
  day,
  CASE
    WHEN start_time < end_time OR day = first_day THEN start_time
    ELSE '00:00'
  END,
  CASE
    WHEN start_time < end_time OR day = last_day THEN end_time
    ELSE '23:59'
  END,
  NOT (start_time < end_time) AND day <> first_day AND day <> last_day
FROM days;
