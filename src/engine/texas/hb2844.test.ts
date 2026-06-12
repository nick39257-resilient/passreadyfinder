import {
  HB2844_MOBILE_PITCH_TEMPLATE,
  buildHb2844MobileOutreachMessage,
  classifyMobileVendorTier,
  isLikelyMobileVendor,
} from "./hb2844.js";

if (!isLikelyMobileVendor({ businessName: "Taco Truck TX", vehicleType: null })) {
  console.error("expected mobile vendor");
  process.exit(1);
}

const type1 = classifyMobileVendorTier(
  {
    businessName: "Hill Country Snacks",
    vehicleType: "mobile unit",
    menuDescription: "prepackaged sandwiches and sealed beverages",
  },
  { assumeMobile: true },
);
if (type1 !== "TYPE_I") {
  console.error(`expected TYPE_I, got ${type1}`);
  process.exit(1);
}

const type2 = classifyMobileVendorTier(
  {
    businessName: "BBQ Trailer",
    primaryActivity: "limited prep hot hold",
  },
  { assumeMobile: true },
);
if (type2 !== "TYPE_II") {
  console.error(`expected TYPE_II, got ${type2}`);
  process.exit(1);
}

const type3 = classifyMobileVendorTier(
  {
    businessName: "Smokehouse Kitchen Truck",
    facilityDescription: "full kitchen on-site cooking with frying",
  },
  { assumeMobile: true },
);
if (type3 !== "TYPE_III") {
  console.error(`expected TYPE_III, got ${type3}`);
  process.exit(1);
}

const msg = buildHb2844MobileOutreachMessage({ ownerName: "Maria" });
if (!msg.includes("HB 2844") || !msg.includes("Maria")) {
  console.error("HB 2844 template missing tokens");
  process.exit(1);
}
if (
  !HB2844_MOBILE_PITCH_TEMPLATE.includes("chain-of-custody") ||
  !HB2844_MOBILE_PITCH_TEMPLATE.includes("PassReady US mobile module")
) {
  console.error("HB 2844 template missing mobile module / chain-of-custody copy");
  process.exit(1);
}

console.log("hb2844.test: ok");
