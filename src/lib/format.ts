import type { AthleteRoundResult } from "../../server/src/types/domain";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function formatClock(seconds?: number) {
  if (seconds === undefined) return "estimated";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function timeOnly(iso: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

export function flag(countryCode: string) {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function athleteById(results: AthleteRoundResult[], id: string) {
  return results.find((result) => result.athlete.id === id);
}

export function countryName(code: string) {
  return regionNames.of(code) ?? code;
}
