/** Leads with business + location + risk data for Maps / social / DM outreach. */
export const TEXAS_MULTI_CHANNEL_READY_SQL = `
  TRIM(business_name) != ''
  AND (
    (zip IS NOT NULL AND TRIM(zip) != '')
    OR (city IS NOT NULL AND TRIM(city) != '')
    OR (address IS NOT NULL AND TRIM(address) != '')
  )
  AND risk_score IS NOT NULL
  AND status NOT IN ('EMAIL_SENT', 'FORM_SUBMITTED')
`;

export type TexasMultiChannelLeadInput = {
  businessName: string;
  zip: string | null;
  city: string | null;
  address: string | null;
  county: string | null;
  demerits: number | null;
  texasRiskScore: number;
  hb2844DraftPreview: string | null;
  isMobileVendor: boolean;
  status: string;
};

export function texasSocialCityLabel(city: string | null, county: string | null): string {
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

export function buildTexasMapsSearchUrl(input: {
  businessName: string;
  zip: string | null;
  city: string | null;
  address: string | null;
}): string | null {
  const name = input.businessName?.trim();
  if (!name) {
    return null;
  }
  const parts = [name];
  if (input.zip?.trim()) {
    parts.push(input.zip.trim());
  } else if (input.city?.trim()) {
    parts.push(input.city.trim());
  } else if (input.address?.trim()) {
    parts.push(input.address.trim());
  } else {
    return null;
  }
  const query = parts.join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildTexasSocialSearchUrl(input: {
  businessName: string;
  city: string | null;
  county: string | null;
}): string | null {
  const name = input.businessName?.trim();
  if (!name) {
    return null;
  }
  const place = texasSocialCityLabel(input.city, input.county);
  const q = `${name} social media ${place}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function buildTexasPitchScript(input: TexasMultiChannelLeadInput): string {
  const draft = input.hb2844DraftPreview?.trim();
  if (draft) {
    return draft;
  }
  const demeritNote =
    input.demerits != null && Number.isFinite(input.demerits)
      ? ` (${input.demerits} demerits on the last inspection)`
      : "";
  const riskNote =
    input.texasRiskScore > 0 ? ` — risk score ${input.texasRiskScore}` : "";
  if (input.isMobileVendor) {
    return `Hey — with Texas HB 2844 mobile compliance kicking in this July, DSHS is centralizing truck inspections into a permanent statewide record. ${input.businessName} is showing inspection pressure${demeritNote}${riskNote}. We built PassReady to automate this exact digital chain of custody...`;
  }
  return `Hey — I noticed ${input.businessName} has inspection pressure${demeritNote}${riskNote}. We built PassReady to help Texas operators stay ahead of DSHS compliance. Worth a quick chat?`;
}

export function isTexasMultiChannelReady(input: {
  businessName: string;
  zip: string | null;
  city: string | null;
  address: string | null;
  texasRiskScore: number;
  status: string;
}): boolean {
  if (!input.businessName?.trim()) {
    return false;
  }
  if (input.status === "EMAIL_SENT" || input.status === "FORM_SUBMITTED") {
    return false;
  }
  const hasLocation = Boolean(
    input.zip?.trim() || input.city?.trim() || input.address?.trim(),
  );
  return hasLocation && Number.isFinite(input.texasRiskScore);
}
