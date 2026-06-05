import type { ApiTexasLead } from "../api/texas-leads";

export function texasSocialCityLabel(
  city: string | null,
  county: string | null,
): string {
  const c = city?.trim();
  if (c) {
    return /,\s*TX$/i.test(c) ? c : `${c} TX`;
  }
  const countyName = county?.trim();
  if (countyName) {
    return `${countyName}, TX`;
  }
  return "Austin TX";
}

export function buildTexasMapsSearchUrl(lead: Pick<
  ApiTexasLead,
  "businessName" | "zip" | "city" | "address"
>): string | null {
  const name = lead.businessName?.trim();
  if (!name) {
    return null;
  }
  const parts = [name];
  if (lead.zip?.trim()) {
    parts.push(lead.zip.trim());
  } else if (lead.city?.trim()) {
    parts.push(lead.city.trim());
  } else if (lead.address?.trim()) {
    parts.push(lead.address.trim());
  } else {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(" "))}`;
}

export function buildTexasSocialSearchUrl(lead: Pick<
  ApiTexasLead,
  "businessName" | "city" | "county"
>): string | null {
  const name = lead.businessName?.trim();
  if (!name) {
    return null;
  }
  const place = texasSocialCityLabel(lead.city, lead.county);
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} social media ${place}`)}`;
}

export function buildTexasPitchScript(lead: ApiTexasLead): string {
  const draft = lead.hb2844DraftPreview?.trim();
  if (draft) {
    return draft;
  }
  const demeritNote =
    lead.demerits != null && Number.isFinite(lead.demerits)
      ? ` (${lead.demerits} demerits on the last inspection)`
      : "";
  const riskNote =
    lead.texasRiskScore > 0 ? ` — risk score ${lead.texasRiskScore}` : "";
  if (lead.isMobileVendor) {
    return `Hey — with Texas HB 2844 mobile compliance kicking in this July, DSHS is centralizing truck inspections into a permanent statewide record. ${lead.businessName} is showing inspection pressure${demeritNote}${riskNote}. We built PassReady to automate this exact digital chain of custody...`;
  }
  return `Hey — I noticed ${lead.businessName} has inspection pressure${demeritNote}${riskNote}. We built PassReady to help Texas operators stay ahead of DSHS compliance. Worth a quick chat?`;
}

export function isTexasMultiChannelReady(lead: ApiTexasLead): boolean {
  if (!lead.businessName?.trim()) {
    return false;
  }
  if (lead.outreachComplete) {
    return false;
  }
  const hasLocation = Boolean(
    lead.zip?.trim() || lead.city?.trim() || lead.address?.trim(),
  );
  return hasLocation && Number.isFinite(lead.texasRiskScore);
}
