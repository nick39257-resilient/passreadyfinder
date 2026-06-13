import { getDeliverabilityStatus } from "./deliverability.js";
import { describeOutreachSender } from "./outreach-mail-from.js";
import { isSmtpMailConfigured } from "./services/smtp-mail-service.js";
import { getScoreTrafficCounts } from "./store/score-traffic-repository.js";
import { getLeadStatusCounts } from "./store/stats-repository.js";
import { getDb } from "./store/db.js";
import { runMigrations } from "./store/db.js";

export interface DeliverabilityReport {
  sendLocked: boolean;
  bounceRate: number;
  bounceThreshold: number;
  reason: string | null;
  emailEvents: {
    sent: number;
    bounce: number;
  };
  uk: {
    contacted: number;
    nurture: number;
    replied: number;
    failedDelivery: number;
    scoreClicks: number;
    clickRatePct: number | null;
    replyRatePct: number | null;
  };
  texas: {
    emailSent: number;
    formSubmitted: number;
    scoreClicks: number;
  };
  scoreClicksTotal: number;
  sender: {
    smtpConfigured: boolean;
    uk: ReturnType<typeof describeOutreachSender>;
    us: ReturnType<typeof describeOutreachSender>;
  };
  mailTester: {
    url: string;
    steps: string[];
  };
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getDeliverabilityReport(): Promise<DeliverabilityReport> {
  await runMigrations();
  const db = getDb();

  const [deliverability, leadCounts, scoreTraffic] = await Promise.all([
    getDeliverabilityStatus(),
    getLeadStatusCounts(),
    getScoreTrafficCounts(),
  ]);

  const eventRows = await db.execute(`
    SELECT event_type, COUNT(*) AS c
    FROM email_events
    WHERE event_type IN ('sent', 'bounce')
    GROUP BY event_type
  `);
  const eventMap = new Map<string, number>();
  for (const row of eventRows.rows) {
    eventMap.set(String(row.event_type), Number(row.c ?? 0));
  }

  const failedResult = await db.execute(`
    SELECT COUNT(*) AS c FROM leads WHERE status = 'failed_delivery'
  `);
  const failedDelivery = Number(failedResult.rows[0]?.c ?? 0);

  const texasSentResult = await db.execute(`
    SELECT COUNT(*) AS c FROM texas_leads WHERE status = 'EMAIL_SENT'
  `);
  const texasFormsResult = await db.execute(`
    SELECT COUNT(*) AS c FROM texas_leads WHERE status = 'FORM_SUBMITTED'
  `);

  const ukSentLogged = eventMap.get("sent") ?? 0;
  const ukScoreClicks = scoreTraffic.uk;
  const ukReplied = leadCounts.replied;

  return {
    sendLocked: deliverability.sendLocked,
    bounceRate: deliverability.bounceRate,
    bounceThreshold: deliverability.bounceThreshold,
    reason: deliverability.reason,
    emailEvents: {
      sent: ukSentLogged,
      bounce: eventMap.get("bounce") ?? 0,
    },
    uk: {
      contacted: leadCounts.contacted,
      nurture: leadCounts.nurture,
      replied: ukReplied,
      failedDelivery,
      scoreClicks: ukScoreClicks,
      clickRatePct: pct(ukScoreClicks, ukSentLogged),
      replyRatePct: pct(ukReplied, ukSentLogged),
    },
    texas: {
      emailSent: Number(texasSentResult.rows[0]?.c ?? 0),
      formSubmitted: Number(texasFormsResult.rows[0]?.c ?? 0),
      scoreClicks: scoreTraffic.us,
    },
    scoreClicksTotal: scoreTraffic.total,
    sender: {
      smtpConfigured: isSmtpMailConfigured(),
      uk: describeOutreachSender("uk"),
      us: describeOutreachSender("us"),
    },
    mailTester: {
      url: "https://www.mail-tester.com",
      steps: [
        "Open mail-tester.com and copy the test address they show.",
        "In PassReady dashboard below, paste that address and send a UK test (and a US test if you use Texas).",
        "Return to mail-tester and click “Then check your score”.",
        "Aim for 8/10 or higher before live outreach. Fix SPF/DKIM/DMARC in Namecheap if below 7.",
        "Also send a test to your personal Gmail and Outlook — check Inbox vs Spam.",
      ],
    },
  };
}
