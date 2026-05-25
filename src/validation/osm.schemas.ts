import { z } from "zod";

const overpassElementSchema = z.object({
  type: z.string(),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z
    .object({
      lat: z.number(),
      lon: z.number(),
    })
    .optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export const overpassResponseSchema = z.object({
  elements: z.array(overpassElementSchema),
});
