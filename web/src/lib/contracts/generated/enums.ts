// GENERATED FILE - DO NOT EDIT.
// Produced by `npm run codegen` from artifact AST EnumDefinition nodes.
// Re-run codegen after any contract change; CI fails on a diff.

export const AircraftCategory = {
  UNSPECIFIED: 0,
  COMMERCIAL_TRANSPORT: 1,
  BUSINESS_JET: 2,
  TURBOPROP: 3,
  ROTORCRAFT: 4,
  GENERAL_AVIATION: 5,
  FREIGHTER: 6,
  UAS: 7,
} as const;
export type AircraftCategory = (typeof AircraftCategory)[keyof typeof AircraftCategory];

export const aircraftCategoryLabel: Record<number, string> = {
  0: "Unspecified",
  1: "Commercial transport",
  2: "Business jet",
  3: "Turboprop",
  4: "Rotorcraft",
  5: "General aviation",
  6: "Freighter",
  7: "UAS",
};

export const AssetKind = {
  UNSPECIFIED: 0,
  AIRCRAFT: 1,
  ENGINE: 2,
  APU: 3,
  COMPONENT: 4,
  PART: 5,
  EQUIPMENT: 6,
} as const;
export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

export const assetKindLabel: Record<number, string> = {
  0: "Unspecified",
  1: "Aircraft",
  2: "Engine",
  3: "APU",
  4: "Component",
  5: "Part",
  6: "Equipment",
};

export const AssetStatus = {
  NONE: 0,
  REGISTERED: 1,
  IN_SERVICE: 2,
  STORED: 3,
  UNDER_MAINTENANCE: 4,
  RETIRED: 5,
  DESTROYED: 6,
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const assetStatusLabel: Record<number, string> = {
  0: "None",
  1: "Registered",
  2: "In service",
  3: "Stored",
  4: "Under maintenance",
  5: "Retired",
  6: "Destroyed",
};

export const ComponentKind = {
  UNSPECIFIED: 0,
  ENGINE: 1,
  APU: 2,
  LANDING_GEAR: 3,
  AVIONICS: 4,
  AIRFRAME_STRUCTURE: 5,
  INTERIOR: 6,
  PROPELLER: 7,
  OTHER: 8,
} as const;
export type ComponentKind = (typeof ComponentKind)[keyof typeof ComponentKind];

export const componentKindLabel: Record<number, string> = {
  0: "Unspecified",
  1: "Engine",
  2: "APU",
  3: "Landing gear",
  4: "Avionics",
  5: "Airframe structure",
  6: "Interior",
  7: "Propeller",
  8: "Other",
};

export const ComponentStatus = {
  NONE: 0,
  UNINSTALLED: 1,
  INSTALLED: 2,
  IN_REPAIR: 3,
  QUARANTINED: 4,
  SCRAPPED: 5,
} as const;
export type ComponentStatus = (typeof ComponentStatus)[keyof typeof ComponentStatus];

export const componentStatusLabel: Record<number, string> = {
  0: "None",
  1: "Uninstalled",
  2: "Installed",
  3: "In repair",
  4: "Quarantined",
  5: "Scrapped",
};

export const CredentialStatus = {
  NONE: 0,
  ACTIVE: 1,
  SUSPENDED: 2,
  EXPIRED: 3,
  REVOKED: 4,
} as const;
export type CredentialStatus = (typeof CredentialStatus)[keyof typeof CredentialStatus];

export const credentialStatusLabel: Record<number, string> = {
  0: "None",
  1: "Active",
  2: "Suspended",
  3: "Expired",
  4: "Revoked",
};

export const CredentialType = {
  UNSPECIFIED: 0,
  MAINTENANCE_AUTHORITY: 1,
  INSPECTION_AUTHORITY: 2,
  MANUFACTURING_APPROVAL: 3,
  OPERATING_APPROVAL: 4,
  DISTRIBUTION_APPROVAL: 5,
  OTHER: 6,
} as const;
export type CredentialType = (typeof CredentialType)[keyof typeof CredentialType];

export const credentialTypeLabel: Record<number, string> = {
  0: "Unspecified",
  1: "Maintenance authority",
  2: "Inspection authority",
  3: "Manufacturing approval",
  4: "Operating approval",
  5: "Distribution approval",
  6: "Other",
};

export const DocumentStatus = {
  NONE: 0,
  ACTIVE: 1,
  SUPERSEDED: 2,
  REVOKED: 3,
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const documentStatusLabel: Record<number, string> = {
  0: "None",
  1: "Active",
  2: "Superseded",
  3: "Revoked",
};

export const DocumentType = {
  UNSPECIFIED: 0,
  AIRWORTHINESS_CERTIFICATE: 1,
  REGISTRATION_CERTIFICATE: 2,
  MAINTENANCE_RECORD: 3,
  AD_COMPLIANCE: 4,
  SB_COMPLIANCE: 5,
  LOGBOOK: 6,
  WEIGHT_AND_BALANCE: 7,
  LEASE_AGREEMENT: 8,
  BILL_OF_SALE: 9,
  INSPECTION_REPORT: 10,
  OTHER: 11,
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const documentTypeLabel: Record<number, string> = {
  0: "Unspecified",
  1: "Airworthiness certificate",
  2: "Registration certificate",
  3: "Maintenance record",
  4: "AD compliance",
  5: "SB compliance",
  6: "Logbook",
  7: "Weight and balance",
  8: "Lease agreement",
  9: "Bill of sale",
  10: "Inspection report",
  11: "Other",
};

export const EscrowStatus = {
  NONE: 0,
  AWAITING_FUNDING: 1,
  FUNDED: 2,
  DISPUTED: 3,
  RELEASED: 4,
  REFUNDED: 5,
  CANCELLED: 6,
} as const;
export type EscrowStatus = (typeof EscrowStatus)[keyof typeof EscrowStatus];

export const escrowStatusLabel: Record<number, string> = {
  0: "None",
  1: "Awaiting funding",
  2: "Funded",
  3: "Disputed",
  4: "Released",
  5: "Refunded",
  6: "Cancelled",
};

export const ListingStatus = {
  NONE: 0,
  ACTIVE: 1,
  SOLD: 2,
  CANCELLED: 3,
  EXPIRED: 4,
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

export const listingStatusLabel: Record<number, string> = {
  0: "None",
  1: "Active",
  2: "Sold",
  3: "Cancelled",
  4: "Expired",
};

export const MaintenanceType = {
  UNSPECIFIED: 0,
  LINE_CHECK: 1,
  A_CHECK: 2,
  B_CHECK: 3,
  C_CHECK: 4,
  D_CHECK: 5,
  ENGINE_OVERHAUL: 6,
  COMPONENT_REPLACEMENT: 7,
  AD_COMPLIANCE: 8,
  SB_COMPLIANCE: 9,
  REPAIR: 10,
  INSPECTION: 11,
  OTHER: 12,
} as const;
export type MaintenanceType = (typeof MaintenanceType)[keyof typeof MaintenanceType];

export const maintenanceTypeLabel: Record<number, string> = {
  0: "Unspecified",
  1: "Line check",
  2: "A check",
  3: "B check",
  4: "C check",
  5: "D check",
  6: "Engine overhaul",
  7: "Component replacement",
  8: "AD compliance",
  9: "SB compliance",
  10: "Repair",
  11: "Inspection",
  12: "Other",
};

export const OfferStatus = {
  NONE: 0,
  ACTIVE: 1,
  ACCEPTED: 2,
  WITHDRAWN: 3,
  REJECTED: 4,
  EXPIRED: 5,
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const offerStatusLabel: Record<number, string> = {
  0: "None",
  1: "Active",
  2: "Accepted",
  3: "Withdrawn",
  4: "Rejected",
  5: "Expired",
};

export const OrganizationStatus = {
  NONE: 0,
  PENDING: 1,
  VERIFIED: 2,
  SUSPENDED: 3,
  REVOKED: 4,
} as const;
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const organizationStatusLabel: Record<number, string> = {
  0: "None",
  1: "Pending",
  2: "Verified",
  3: "Suspended",
  4: "Revoked",
};

export const OrganizationType = {
  UNSPECIFIED: 0,
  AIRLINE: 1,
  OPERATOR: 2,
  MRO: 3,
  MANUFACTURER: 4,
  LESSOR: 5,
  BROKER: 6,
  SUPPLIER: 7,
  INSPECTOR: 8,
} as const;
export type OrganizationType = (typeof OrganizationType)[keyof typeof OrganizationType];

export const organizationTypeLabel: Record<number, string> = {
  0: "Unspecified",
  1: "Airline",
  2: "Operator",
  3: "MRO",
  4: "Manufacturer",
  5: "Lessor",
  6: "Broker",
  7: "Supplier",
  8: "Inspector",
};
