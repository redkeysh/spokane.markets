import { formatTime } from "@/lib/admin/format";

/** Time choices in 15 minute steps from 6:00 am round the clock, plus 11:59 pm for closing. */
export function timeChoices(): string[] {
  const all: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    all.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  const pivot = all.indexOf("06:00");
  return [...all.slice(pivot), ...all.slice(0, pivot), "23:59"];
}

const TIMES = timeChoices();

/**
 * The options of every admin time select: "Choose", then the times written "8:00 am". A
 * `value` off the 15 minute steps is kept as the first choice, so a saved time still shows.
 */
export function TimeOptions({ value }: { value: string }) {
  const choices = value && !TIMES.includes(value) ? [value, ...TIMES] : TIMES;
  return (
    <>
      <option value="">Choose</option>
      {choices.map((t) => (
        <option key={t} value={t}>
          {formatTime(t)}
        </option>
      ))}
    </>
  );
}
