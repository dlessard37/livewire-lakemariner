// mark-ticket.mjs — set status/note on an ADD TO THE GAME ticket.
// Auth: FIREBASE_SA_JSON env var (service-account key JSON) or
// GOOGLE_APPLICATION_CREDENTIALS pointing at the key file.
// usage: node mark-ticket.mjs <ticketId> <new|wip|done|passed> [note...]
import crypto from "node:crypto";
import fs from "node:fs";

const raw =
  process.env.FIREBASE_SA_JSON ||
  (process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
if (!raw) {
  console.error("No credentials: set FIREBASE_SA_JSON or GOOGLE_APPLICATION_CREDENTIALS");
  process.exit(1);
}
const sa = JSON.parse(raw);

const [id, status, ...noteParts] = process.argv.slice(2);
const note = noteParts.join(" ").slice(0, 300);
if (!id || !["new", "wip", "done", "passed"].includes(status)) {
  console.error("usage: node mark-ticket.mjs <ticketId> <new|wip|done|passed> [note...]");
  process.exit(1);
}

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned =
  b64u({ alg: "RS256", typ: "JWT" }) +
  "." +
  b64u({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  });
const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
const tokRes = await fetch(sa.token_uri, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body:
    "grant_type=" +
    encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
    "&assertion=" +
    unsigned +
    "." +
    sig,
});
const tok = await tokRes.json();
if (!tok.access_token) {
  console.error("token error:", JSON.stringify(tok).slice(0, 200));
  process.exit(1);
}

const url =
  `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/tickets/${id}` +
  // exists=true: PATCH must never upsert a ghost ticket for a bad id
  "?updateMask.fieldPaths=status&updateMask.fieldPaths=note&currentDocument.exists=true";
const r = await fetch(url, {
  method: "PATCH",
  headers: { Authorization: "Bearer " + tok.access_token, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { status: { stringValue: status }, note: { stringValue: note } } }),
});
const bodyText = (await r.text()).slice(0, 200);
console.log(r.status, r.ok ? "ok" : bodyText);
process.exit(r.ok ? 0 : 1);
