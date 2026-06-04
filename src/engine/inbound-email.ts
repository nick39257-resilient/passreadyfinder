/** Parse `Name <a@b.com>` or plain `a@b.com` from Resend inbound metadata. */
export function parseInboundFromAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const bracket = trimmed.match(/<([^>]+)>/);
  const candidate = (bracket ? bracket[1] : trimmed).trim().toLowerCase();
  return candidate.includes("@") ? candidate : null;
}
