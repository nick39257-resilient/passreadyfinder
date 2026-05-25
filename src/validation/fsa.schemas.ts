import { z } from "zod";

const fsaBusinessTypeSchema = z.object({
  BusinessTypeId: z.number(),
  BusinessTypeName: z.string(),
});

const fsaAuthoritySchema = z.object({
  LocalAuthorityId: z.number(),
  LocalAuthorityIdCode: z.string(),
  Name: z.string(),
});

/** FSA sometimes returns null or omits lat/long inside geocode */
const geocodeSchema = z.object({
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
});

const fsaEstablishmentSchema = z.object({
  FHRSID: z.number(),
  BusinessName: z.string(),
  BusinessType: z.string(),
  BusinessTypeID: z.number(),
  AddressLine1: z.string(),
  AddressLine2: z.string(),
  AddressLine3: z.string(),
  AddressLine4: z.string(),
  PostCode: z.string(),
  RatingValue: z.string(),
  RatingKey: z.string(),
  RatingDate: z.string(),
  SchemeType: z.string(),
  LocalAuthorityName: z.string(),
  geocode: geocodeSchema.nullable().optional(),
});

const fsaPaginatedMetaSchema = z.object({
  totalCount: z.number(),
  totalPages: z.number(),
  pageNumber: z.number(),
  pageSize: z.number(),
});

export const fsaEstablishmentsResponseSchema = z.object({
  establishments: z.array(fsaEstablishmentSchema),
  meta: fsaPaginatedMetaSchema,
});

export const fsaBusinessTypesResponseSchema = z.object({
  businessTypes: z.array(fsaBusinessTypeSchema),
});

export const fsaAuthoritiesResponseSchema = z.object({
  authorities: z.array(fsaAuthoritySchema),
});
