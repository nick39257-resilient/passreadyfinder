export interface ActivityItem {
  id: string;
  message: string;
  status: string;
  updatedAt: string;
}

export interface ActivityResponse {
  items: ActivityItem[];
  complianceTip: string;
}

export async function fetchActivity(): Promise<ActivityResponse> {
  const res = await fetch("/api/activity");
  if (!res.ok) {
    throw new Error(`Failed to load activity (${res.status})`);
  }
  return res.json() as Promise<ActivityResponse>;
}
