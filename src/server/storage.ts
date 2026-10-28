import "server-only";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { appendRow, readColumn, readRows, sheetsConfigured } from "./sheets";

// Where Feast entries go, in order of preference:
//  1. Google Sheets (GOOGLE_SHEET_ID + service account): one tab per table, see sheets.ts.
//  2. Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY): a table per kind.
//  3. Local development: .data/<table>.jsonl, so nothing is lost.
// And on Netlify, every entry is also kept in Netlify Blobs (store "entries", key <table>/<time>-<id>)
// before it goes anywhere else: a backup if the sheet is down, edited or emptied by mistake.

/** Every kind of entry, its tab name in the sheet and its columns (in order). */
export const TABLES = {
  registrations: { tab: "Registrations", headers: ["created_at", "first_name", "last_name", "email", "phone", "country", "referral_code", "referred_by", "emailed", "attendance", "days", "with_kids", "kids_ages", "with_teens", "kids_count", "teens_count", "ticket_id"] },
  merch: { tab: "Merch", headers: ["created_at", "name", "email", "phone", "item", "size", "quantity", "total", "notes", "color", "design"] },
  games: { tab: "Games", headers: ["created_at", "game", "answer", "guesses", "won", "seconds"] },
  winners: { tab: "Winners", headers: ["created_at", "game", "answer", "guesses", "name", "email", "phone"] },
  volunteers: { tab: "Volunteers", headers: ["created_at", "name", "contact", "teams"] },
  testimonies: { tab: "Testimonies", headers: ["created_at", "name", "text", "published"] },
  invites: { tab: "Invites", headers: ["created_at", "id", "from_name", "friend_name", "friend_email", "pickup_label", "pickup_lat", "pickup_lon"] },
} as const;
export type Table = keyof typeof TABLES;

/** The backup store on Netlify; null anywhere else (local development). */
function backupStore() {
  try {
    return getStore({ name: "entries", consistency: "strong" });
  } catch {
    return null;
  }
}

export async function save(table: Table, row: Record<string, unknown>) {
  const record = { ...row, created_at: new Date().toISOString() };
  const backup = backupStore();
  let backedUp = false;
  if (backup) {
    try {
      await backup.setJSON(`${table}/${record.created_at}-${randomUUID().slice(0, 8)}`, record);
      backedUp = true;
    } catch (e) {
      console.error("backup", table, e);
    }
  }
  try {
    await saveMain(table, record, backedUp);
  } catch (e) {
    // kept in the backup: the visitor's entry still counts
    if (!backedUp) throw e;
    console.error("storage", table, e);
  }
}

async function saveMain(table: Table, record: Record<string, unknown>, backedUp: boolean) {
  if (sheetsConfigured()) {
    const t = TABLES[table];
    return appendRow(t.tab, [...t.headers], record);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`storage ${table}: ${res.status} ${await res.text()}`);
    return;
  }
  // on Netlify the backup is the store (its files don't last)
  if (backedUp) return;
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, `${table}.jsonl`), JSON.stringify(record) + "\n");
}

/** Every entry in a table (from wherever entries are kept). */
async function rowsOf(table: Table): Promise<Record<string, unknown>[]> {
  if (sheetsConfigured()) return readRows(TABLES[table].tab);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return res.ok ? ((await res.json()) as Record<string, unknown>[]) : [];
  }
  const backup = backupStore();
  if (backup) {
    const { blobs } = await backup.list({ prefix: `${table}/` });
    return (await Promise.all(blobs.map((b) => backup.get(b.key, { type: "json" })))).filter(Boolean);
  }
  try {
    const text = await readFile(path.join(process.cwd(), ".data", `${table}.jsonl`), "utf8");
    return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** The (latest) entry whose `field` is `value`, ignoring case and spaces; null if none. */
export async function findOne(table: Table, field: string, value: string) {
  const want = value.replace(/\s+/g, "").toUpperCase();
  const rows = await rowsOf(table);
  for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i][field] ?? "").replace(/\s+/g, "").toUpperCase() === want) return rows[i];
  return null;
}

/** All values of one field in a table (e.g. existing referral codes). */
export async function column(table: Table, field: string): Promise<string[]> {
  if (sheetsConfigured()) return readColumn(TABLES[table].tab, field);
  const backup = backupStore();
  if (backup) {
    const { blobs } = await backup.list({ prefix: `${table}/` });
    const rows = await Promise.all(blobs.map((b) => backup.get(b.key, { type: "json" })));
    return rows.map((r) => String(r?.[field] ?? ""));
  }
  try {
    const text = await readFile(path.join(process.cwd(), ".data", `${table}.jsonl`), "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => String(JSON.parse(l)[field] ?? ""));
  } catch {
    return [];
  }
}
