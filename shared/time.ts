/** Formats minute boundaries as HH:MM, including 1440 as the end-of-day value 24:00. */
export const formatTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
