type BusinessHoursDay = { enabled: boolean; start: string; end: string };
export type BusinessHours = {
  enabled: boolean;
  timezone: string;
  weeklySchedule: Record<string, BusinessHoursDay>;
};

export type ResponseDelaySettings = {
  minMinutes: number;
  maxMinutes: number;
};

const WEEKDAY_KEYS: Record<string, string> = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );
  return {
    day: WEEKDAY_KEYS[values.weekday] ?? "",
    time: `${values.hour}:${values.minute}`,
  };
}

export function isWithinBusinessHours(
  date: Date,
  businessHours: BusinessHours
): boolean {
  if (!businessHours.enabled) {
    return true;
  }
  const { day, time } = localParts(date, businessHours.timezone);
  const schedule = businessHours.weeklySchedule[day];
  return Boolean(
    schedule?.enabled && time >= schedule.start && time < schedule.end
  );
}

export function getNextBusinessOpening(
  date: Date,
  businessHours: BusinessHours
): Date | null {
  if (!businessHours.enabled || isWithinBusinessHours(date, businessHours)) {
    return null;
  }
  return findNextOpening(date, businessHours);
}

function findNextOpening(date: Date, businessHours: BusinessHours): Date {
  const candidate = new Date(date);
  candidate.setSeconds(0, 0);
  if (candidate < date) {
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  for (let minute = 0; minute < 8 * 24 * 60; minute += 1) {
    const check = new Date(candidate.getTime() + minute * 60_000);
    if (isWithinBusinessHours(check, businessHours)) {
      return check;
    }
  }
  throw new Error(
    "No hay ningún horario laboral configurado para la próxima semana"
  );
}

export function getNextResponseAt(
  now: Date,
  businessHours: BusinessHours,
  delay: ResponseDelaySettings,
  random: () => number = Math.random
): Date | null {
  let start = now;
  if (businessHours.enabled && !isWithinBusinessHours(now, businessHours)) {
    start = findNextOpening(now, businessHours);
  }

  const spread = delay.maxMinutes - delay.minMinutes + 1;
  const delayMinutes =
    delay.minMinutes +
    Math.floor(Math.max(0, Math.min(random(), 0.999_999)) * spread);
  let responseAt = new Date(start.getTime() + delayMinutes * 60_000);

  if (
    businessHours.enabled &&
    !isWithinBusinessHours(responseAt, businessHours)
  ) {
    responseAt = findNextOpening(responseAt, businessHours);
  }

  return responseAt.getTime() > now.getTime() ? responseAt : null;
}
