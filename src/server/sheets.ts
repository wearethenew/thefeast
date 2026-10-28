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

const known = new Set<string>();

/** Make sure a tab exists, with a header row when it's new. */
async function ensureTab(tab: string, headers: string[]) {
  if (known.has(tab)) return;
  const meta = (await call("?fields=sheets.properties.title")) as { sheets: { properties: { title: string } }[] };
  if (!meta.sheets.some((s) => s.properties.title === tab)) {
    await call(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
    await call(`/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW`, { method: "POST", body: JSON.stringify({ values: [headers] }) });
  } else {
    // a tab made before new columns were added: extend its header row to match
    const head = (await call(`/values/${encodeURIComponent(tab)}!1:1`)) as { values?: string[][] };
    const have = head.values?.[0] ?? [];
    if (have.length < headers.length && have.every((h, i) => h === headers[i]))
      await call(`/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) });
  }
  known.add(tab);
}

/** Append one row to a tab (columns in the order of `headers`). */
export async function appendRow(tab: string, headers: string[], row: Record<string, unknown>) {
  await ensureTab(tab, headers);
  const values = [headers.map((h) => {
    const v = row[h];
    return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  })];
  await call(`/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values }) });
}

/** Every value in one column of a tab (by header name), without the header. */
export async function readColumn(tab: string, header: string): Promise<string[]> {
  try {
    const head = (await call(`/values/${encodeURIComponent(tab)}!1:1`)) as { values?: string[][] };
    const col = head.values?.[0]?.indexOf(header) ?? -1;
    if (col < 0) return [];
    const letter = String.fromCharCode(65 + col);
    const data = (await call(`/values/${encodeURIComponent(tab)}!${letter}2:${letter}`)) as { values?: string[][] };
    return (data.values ?? []).map((r) => r[0] ?? "");
  } catch {
    return [];
  }
}
