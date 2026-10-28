// The three Feast days, and how a registration's chosen days are read and shown.

/** The three Feast days, in order: name, short name, and the date for a one-day pass. */
export const DAYS = [
  { id: "fri", name: "Friday", short: "Fri", date: "Fri 11 Dec" },
  { id: "sat", name: "Saturday", short: "Sat", date: "Sat 12 Dec" },
  { id: "sun", name: "Sunday", short: "Sun", date: "Sun 13 Dec" },
];
/** The onsite days picked (any of the three: a list, or "fri,sun"; "all" for all three), in order. */
export function pickedDays(v: unknown) {
  const ids = (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[,\s-]+/)).map((d) => d.toLowerCase());
  return DAYS.filter((d) => ids.includes("all") || ids.includes(d.id));
}
/** "Friday", "Friday & Sunday", "all three days". */
export const daysLabel = (d: typeof DAYS) => (d.length === 3 ? "all three days" : d.map((x) => x.name).join(" & "));
/** What the pass says: "Sat 12 Dec", "Fri · Sun". */
export const daysPass = (d: typeof DAYS) => (d.length === 1 ? d[0].date : d.map((x) => x.short).join(" · "));
