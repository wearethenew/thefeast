// The three Feast days, and how a registration's chosen days are read and shown.

/** The three Feast days, in order: name, short name, the date for a one-day pass, and the date as the email gives it. */
export const DAYS = [
  { id: "fri", name: "Friday", short: "Fri", date: "Fri 11 Dec", full: "Fri Dec 11" },
  { id: "sat", name: "Saturday", short: "Sat", date: "Sat 12 Dec", full: "Sat Dec 12" },
  { id: "sun", name: "Sunday", short: "Sun", date: "Sun 13 Dec", full: "Sun Dec 13" },
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
/** Every day picked, dated: "Fri Dec 11", "Fri Dec 11 & Sun Dec 13", "Fri Dec 11, Sat Dec 12 & Sun Dec 13". */
export const daysFull = (d: typeof DAYS) => {
  const all = d.map((x) => x.full);
  return all.length > 1 ? `${all.slice(0, -1).join(", ")} & ${all[all.length - 1]}` : all.join("");
};
