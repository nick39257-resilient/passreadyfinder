import { ensureLeadUnsubscribeToken, suppressLeadByToken } from "../src/engine/outreach-halt.ts";
import { getLeadById } from "../src/engine/store/leads-repository.ts";

const leadId = Number(process.argv[2] || "104");
const token = await ensureLeadUnsubscribeToken(leadId);
const base = process.env.PUBLIC_APP_URL || "http://localhost:3000";
const res = await fetch(`${base}/api/outreach/unsubscribe?token=${encodeURIComponent(token)}`);
const text = await res.text();
const row = await getLeadById(leadId);
console.log(JSON.stringify({ leadId, httpStatus: res.status, leadStatus: row?.status, bodySnippet: text.slice(0, 60) }, null, 2));
