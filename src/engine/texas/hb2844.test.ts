import {
  buildHb2844MobileOutreachMessage,
  classifyMobileVendorTier,
  isLikelyMobileVendor,
} from "./hb2844.js";

if (!isLikelyMobileVendor({ businessName: "Taco Truck TX", vehicleType: null })) {
  console.error("expected mobile vendor");
  process.exit(1);
}

const tier = classifyMobileVendorTier({
  businessName: "Prepackaged Snack Cart",
  vehicleType: "mobile unit",
});
if (tier !== "TYPE_I") {
  console.error(`expected TYPE_I, got ${tier}`);
  process.exit(1);
}

const msg = buildHb2844MobileOutreachMessage({
  ownerName: "Maria",
  businessName: "Lone Star Tacos",
});
if (!msg.includes("HB 2844") || !msg.includes("Maria") || !msg.includes("Lone Star Tacos")) {
  console.error("HB 2844 template missing tokens");
  process.exit(1);
}

console.log("hb2844.test: ok");
