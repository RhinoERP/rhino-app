import { describe, expect, it } from "vitest";
import {
  type BusinessHours,
  getNextBusinessOpening,
  getNextResponseAt,
} from "./response-schedule";

const hours: BusinessHours = {
  enabled: true,
  timezone: "America/Argentina/Buenos_Aires",
  weeklySchedule: Object.fromEntries(
    [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ].map((day) => [
      day,
      {
        enabled: !["saturday", "sunday"].includes(day),
        start: "09:00",
        end: "18:00",
      },
    ])
  ),
};

describe("durable response scheduling", () => {
  it("defers a Friday evening message until Monday in the configured timezone", () => {
    expect(
      getNextResponseAt(
        new Date("2026-10-23T22:00:00Z"),
        hours,
        { minMinutes: 1, maxMinutes: 3 },
        () => 0
      )?.toISOString()
    ).toBe("2026-10-26T12:01:00.000Z");
  });

  it("moves a delay that crosses closing time to the next opening", () => {
    expect(
      getNextResponseAt(new Date("2026-10-26T20:59:00Z"), hours, {
        minMinutes: 3,
        maxMinutes: 3,
      })?.toISOString()
    ).toBe("2026-10-27T12:00:00.000Z");
  });

  it("does not apply the human delay again when a deferred job resumes", () => {
    expect(
      getNextBusinessOpening(new Date("2026-10-26T12:01:00Z"), hours)
    ).toBeNull();
  });

  it("responds immediately with disabled hours and zero delay", () => {
    expect(
      getNextResponseAt(
        new Date("2026-10-25T02:00:00Z"),
        { ...hours, enabled: false },
        { minMinutes: 0, maxMinutes: 0 }
      )
    ).toBeNull();
  });
});
