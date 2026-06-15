import { getDailyCapResetDescription, getDailySendQuota } from "../daily-send-cap.js";
import { getRecentEngineLogs } from "./engine-log-repository.js";
import {
  getMarketingTrafficTodayCounts,
  getRegionalMarketingTrafficToday,
  type RegionalTrafficRow,
} from "./marketing-traffic-repository.js";
import { getTrialSignupsToday, type PulseTrialSignupRow } from "./pulse-trial-repository.js";
import { getScoreTrafficCounts } from "./score-traffic-repository.js";
import { runMigrations } from "./db.js";

export const UK_POSTCODE_PREFIX_LABELS: Record<string, string> = {
  PR: "Preston",
  M: "Manchester",
  L: "Liverpool",
  BB: "Blackburn",
  BL: "Bolton",
  WN: "Wigan",
  OL: "Oldham",
  SK: "Stockport",
  WA: "Warrington",
  FY: "Blackpool",
  LA: "Lancaster",
  BD: "Bradford",
  HX: "Halifax",
  HD: "Huddersfield",
  LS: "Leeds",
  WF: "Wakefield",
  S: "Sheffield",
  DN: "Doncaster",
  HU: "Hull",
  YO: "York",
  NE: "Newcastle",
  SR: "Sunderland",
  DH: "Durham",
  CA: "Carlisle",
  B: "Birmingham",
  CV: "Coventry",
  LE: "Leicester",
  NG: "Nottingham",
  DE: "Derby",
  ST: "Stoke",
  WS: "Walsall",
  WV: "Wolverhampton",
  DY: "Dudley",
  WR: "Worcester",
  GL: "Gloucester",
  BS: "Bristol",
  BA: "Bath",
  SN: "Swindon",
  OX: "Oxford",
  RG: "Reading",
  SL: "Slough",
  HP: "Hemel Hempstead",
  AL: "St Albans",
  LU: "Luton",
  MK: "Milton Keynes",
  NN: "Northampton",
  PE: "Peterborough",
  CB: "Cambridge",
  IP: "Ipswich",
  NR: "Norwich",
  CO: "Colchester",
  SS: "Southend",
  CM: "Chelmsford",
  EN: "Enfield",
  N: "North London",
  E: "East London",
  EC: "City of London",
  WC: "West Central London",
  W: "West London",
  SW: "South West London",
  SE: "South East London",
  NW: "North West London",
  BR: "Bromley",
  CR: "Croydon",
  KT: "Kingston",
  TW: "Twickenham",
  UB: "Southall",
  HA: "Harrow",
  IG: "Ilford",
  RM: "Romford",
  DA: "Dartford",
  TN: "Tunbridge Wells",
  ME: "Medway",
  CT: "Canterbury",
  BN: "Brighton",
  RH: "Redhill",
  GU: "Guildford",
  PO: "Portsmouth",
  SO: "Southampton",
  BH: "Bournemouth",
  DT: "Dorchester",
  EX: "Exeter",
  PL: "Plymouth",
  TR: "Truro",
  TA: "Taunton",
  CF: "Cardiff",
  NP: "Newport",
  SA: "Swansea",
  LL: "Llandudno",
  CH: "Chester",
  SY: "Shrewsbury",
  TF: "Telford",
  CW: "Crewe",
};

export type PulseEmailActivityItem = {
  id: number;
  message: string;
  source: string;
  level: "info" | "error";
  createdAt: string;
};

export type PulseDashboardSnapshot = {
  generatedAt: string;
  traffic: {
    totalToday: number;
    flyerToday: number;
    nfcToday: number;
    scoreTrafficAllTime: { uk: number; us: number; total: number };
  };
  trials: {
    countToday: number;
    signups: PulseTrialSignupRow[];
  };
  email: {
    sentToday: number;
    dailyCap: number;
    remaining: number;
    capResetDescription: string;
    activity: PulseEmailActivityItem[];
  };
  regions: Array<RegionalTrafficRow & { label: string }>;
};

export async function getPulseDashboardSnapshot(): Promise<PulseDashboardSnapshot> {
  await runMigrations();

  const [trafficToday, regions, trials, scoreTraffic, dailyQuota, logs] = await Promise.all([
    getMarketingTrafficTodayCounts(),
    getRegionalMarketingTrafficToday(15),
    getTrialSignupsToday(25),
    getScoreTrafficCounts(),
    getDailySendQuota(),
    getRecentEngineLogs(12),
  ]);

  const emailActivity: PulseEmailActivityItem[] = logs
    .filter((row) => row.source === "send" || row.source === "draft" || row.message.toLowerCase().includes("email"))
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      message: row.message,
      source: row.source,
      level: row.level,
      createdAt: row.created_at,
    }));

  return {
    generatedAt: new Date().toISOString(),
    traffic: {
      totalToday: trafficToday.total,
      flyerToday: trafficToday.flyer,
      nfcToday: trafficToday.nfc,
      scoreTrafficAllTime: scoreTraffic,
    },
    trials: {
      countToday: trials.length,
      signups: trials,
    },
    email: {
      sentToday: dailyQuota.sentToday,
      dailyCap: dailyQuota.cap,
      remaining: dailyQuota.remaining,
      capResetDescription: getDailyCapResetDescription(),
      activity: emailActivity,
    },
    regions: regions.map((row) => ({
      ...row,
      label: UK_POSTCODE_PREFIX_LABELS[row.postcodePrefix] ?? row.postcodePrefix,
    })),
  };
}
