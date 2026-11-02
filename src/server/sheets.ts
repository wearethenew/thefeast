import "server-only";
import { createSign } from "node:crypto";

// Google Sheets as the Feast's record book: one spreadsheet, one tab per kind of entry
// (Registrations, Merch, Games, Winners, Volunteers, Testimonies, Invites). Uses a Google Cloud
// service account (no extra libraries): share the spreadsheet with the service account's email
// as an editor, then set
//   GOOGLE_SHEET_ID                 the id in the sheet's URL (/spreadsheets/d/<id>/edit)
//   GOOGLE_SERVICE_ACCOUNT_EMAIL    xxx@yyy.iam.gserviceaccount.com
//   GOOGLE_PRIVATE_KEY              the key from the JSON file ("-----BEGIN PRIVATE KEY-----\n…")

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export function sheetsConfigured() {
  return !!(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

let token: { value: string; expires: number } | null = null;

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  );
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const signature = b64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
  });
  if (!res.ok) throw new Error(`sheets auth: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}/${process.env.GOOGLE_SHEET_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`sheets ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** A column's letters from its 0-based index: 0 → A, 25 → Z, 26 → AA. */
const colLetter = (i: number): string => (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

/** Each tab's header row as it is in the sheet (once checked this run). */
const known = new Map<string, string[]>();

/**
 * Make sure a tab exists, and that its header row has every column we write. A new column only
 * ever goes after the last one already there (just its header cell is written), so nothing in the
 * sheet moves: every row is matched to the sheet's own headers, by name, whatever their order.
 */
async function ensureTab(tab: string, headers: string[]) {
  const seen = known.get(tab);
  if (seen && headers.every((h) => seen.includes(h))) return seen;
  const meta = (await call("?fields=sheets.properties.title")) as { sheets: { properties: { title: string } }[] };
  let cols: string[];
  if (!meta.sheets.some((s) => s.properties.title === tab)) {
    await call(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
    await call(`/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW`, { method: "POST", body: JSON.stringify({ values: [headers] }) });
    cols = headers;
  } else {
    const head = (await call(`/values/${encodeURIComponent(tab)}!1:1`)) as { values?: string[][] };
    const have = head.values?.[0] ?? [];
    const missing = headers.filter((h) => !have.includes(h));
    if (missing.length)
      await call(`/values/${encodeURIComponent(`${tab}!${colLetter(have.length)}1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [missing] }) });
    cols = [...have, ...missing];
  }
  known.set(tab, cols);
  return cols;
}

/** Append one row to a tab, each value under its header (columns added by hand are left blank). */
export async function appendRow(tab: string, headers: string[], row: Record<string, unknown>) {
  const cols = await ensureTab(tab, headers);
  const values = [cols.map((h) => {
    const v = headers.includes(h) ? row[h] : null;
    return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  })];
  await call(`/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values }) });
}

/** Every row of a tab, as { header: value }. */
export async function readRows(tab: string): Promise<Record<string, string>[]> {
  try {
    const data = (await call(`/values/${encodeURIComponent(tab)}`)) as { values?: string[][] };
    const [head = [], ...rows] = data.values ?? [];
    return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  } catch {
    return [];
  }
}

/** Every value in one column of a tab (by header name), without the header. */
export async function readColumn(tab: string, header: string): Promise<string[]> {
  try {
    const head = (await call(`/values/${encodeURIComponent(tab)}!1:1`)) as { values?: string[][] };
    const col = head.values?.[0]?.indexOf(header) ?? -1;
    if (col < 0) return [];
    const letter = colLetter(col);
    const data = (await call(`/values/${encodeURIComponent(tab)}!${letter}2:${letter}`)) as { values?: string[][] };
    return (data.values ?? []).map((r) => r[0] ?? "");
  } catch {
    return [];
  }
}
