import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), "service-account.json");

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
];

const _clients = new Map<string, JWT>();

function loadKey(): { client_email: string; private_key: string } {
  const envValue = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (envValue) {
    const trimmed = envValue.trim();
    // Accept either the raw JSON (pasted directly) or a base64-encoded copy.
    if (trimmed.startsWith("{")) {
      return JSON.parse(trimmed);
    }
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
    return JSON.parse(decoded);
  }
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
  }
  throw new Error(
    `No Google service account credentials found.\n` +
    `Either set GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON or base64-encoded) or place service-account.json at ${SERVICE_ACCOUNT_PATH}.`
  );
}

export function getAuthClient(subjectEmail?: string): JWT {
  const subject = subjectEmail ?? process.env.GOOGLE_SUBJECT_EMAIL;
  if (!subject) {
    throw new Error(
      `GOOGLE_SUBJECT_EMAIL is not set.\n` +
      `Set it to your Google Workspace admin email (e.g. you@yourcompany.com).`
    );
  }

  if (_clients.has(subject)) return _clients.get(subject)!;

  const key = loadKey();
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    subject,
  });

  _clients.set(subject, client);
  return client;
}
