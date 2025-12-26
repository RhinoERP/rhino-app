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
import type { DateRange, DateRangePreset } from "../types";

export function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date();

  switch (preset) {
    case "today": {
      return {
        startDate: startOfDay(now),
        endDate: endOfDay(now),
      };
    }
    case "week": {
      return {
        startDate: startOfWeek(now, { weekStartsOn: 1 }), // Lunes
        endDate: endOfWeek(now, { weekStartsOn: 1 }),
      };
    }
    case "month": {
      return {
        startDate: startOfMonth(now),
        endDate: endOfMonth(now),
      };
    }
    case "year": {
      return {
        startDate: startOfYear(now),
        endDate: endOfYear(now),
      };
    }
    case "last30": {
      return {
        startDate: startOfDay(subDays(now, 30)),
        endDate: endOfDay(now),
      };
    }
    default: {
      return {
        startDate: startOfMonth(now),
        endDate: endOfMonth(now),
      };
    }
  }
}

export function getPreviousDateRange(
  startDate: Date,
  endDate: Date
): DateRange {
  const duration = endDate.getTime() - startDate.getTime();
  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = new Date(previousEndDate.getTime() - duration);

  return {
    startDate: previousStartDate,
    endDate: previousEndDate,
  };
}

export function calculatePercentageChange(
  current: number,
  previous: number
): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Number(((current - previous) / previous) * 100);
}
