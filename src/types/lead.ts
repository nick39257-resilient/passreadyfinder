export type DeliveryAppStatus = "true" | "false" | "unknown";

export interface Lead {
  id: number;
  fsaId: number;
  businessName: string;
  businessType: string;
  address: string;
  postcode: string;
  latitude: number;
  longitude: number;
  fsaRating: number | null;
  fsaLastInspectionDate: string | null;
  phone: string | null;
  website: string | null;
  onDeliveryApp: DeliveryAppStatus;
  leadScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface OsmEnrichmentResult {
  phone: string | null;
  website: string | null;
  email?: string | null;
  onDeliveryApp: DeliveryAppStatus;
}
