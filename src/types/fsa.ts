export interface FsaBusinessType {
  BusinessTypeId: number;
  BusinessTypeName: string;
}

export interface FsaAuthority {
  LocalAuthorityId: number;
  LocalAuthorityIdCode: string;
  Name: string;
}

export interface FsaEstablishment {
  FHRSID: number;
  BusinessName: string;
  BusinessType: string;
  BusinessTypeID: number;
  AddressLine1: string;
  AddressLine2: string;
  AddressLine3: string;
  AddressLine4: string;
  PostCode: string;
  RatingValue: string;
  RatingKey: string;
  RatingDate: string;
  SchemeType: string;
  LocalAuthorityName: string;
  geocode?: {
    longitude?: string | null;
    latitude?: string | null;
  } | null;
}

export interface FsaPaginatedMeta {
  totalCount: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
}

export interface FsaEstablishmentsResponse {
  establishments: FsaEstablishment[];
  meta: FsaPaginatedMeta;
}

export interface FsaBusinessTypesResponse {
  businessTypes: FsaBusinessType[];
}

export interface FsaAuthoritiesResponse {
  authorities: FsaAuthority[];
}

export interface RawLead {
  fsaId: number;
  businessName: string;
  businessType: string;
  address: string;
  postcode: string;
  latitude: number;
  longitude: number;
  fsaRating: number | null;
  fsaLastInspectionDate: string | null;
  fsaScoreHygiene?: number | null;
  fsaScoreStructural?: number | null;
  fsaScoreManagement?: number | null;
}
