/** Paid density layer — off by default to keep margins near zero. */
export function isGooglePlacesEnabled(): boolean {
  return process.env.GOOGLE_PLACES_ENABLED?.trim().toLowerCase() === "true";
}

export function getGooglePlacesApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key || null;
}

export function assertGooglePlacesReady(): void {
  if (!isGooglePlacesEnabled()) {
    return;
  }
  if (!getGooglePlacesApiKey()) {
    throw new Error(
      "GOOGLE_PLACES_ENABLED is true but GOOGLE_PLACES_API_KEY is missing. Disable the toggle or set the API key.",
    );
  }
}
