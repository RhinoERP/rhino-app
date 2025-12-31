/**
 * Dashboard Date Utilities
 */

import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import type { DateRange, DateRangePreset } from "@/types/dashboard";

export function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date();

  switch (preset) {
    case "today": {
      return {
        from: startOfDay(now),
        to: endOfDay(now),
      };
    }
    case "week": {
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }), // Monday
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    }
    case "month": {
      return {
        from: startOfMonth(now),
        to: endOfMonth(now),
      };
    }
    case "year": {
      return {
        from: startOfYear(now),
        to: endOfYear(now),
      };
    }
    case "last30": {
      return {
        from: startOfDay(subDays(now, 30)),
        to: endOfDay(now),
      };
    }
    default: {
      return {
        from: startOfMonth(now),
        to: endOfMonth(now),
      };
    }
  }
}

export function calculatePercentageChange(
  current: number,
  previous: number
): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Number.parseFloat(
    (((current - previous) / previous) * 100).toFixed(2)
  );
}
