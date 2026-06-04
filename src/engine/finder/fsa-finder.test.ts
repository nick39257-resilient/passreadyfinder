import { resolveBusinessTypeIds } from "./fsa-finder.js";

const names = [
  "Takeaway/sandwich shop",
  "Restaurant/Cafe/Canteen",
  "Mobile caterer",
] as const;

const map = await resolveBusinessTypeIds(names);
for (const name of names) {
  const id = map.get(name);
  if (id == null || id <= 0) {
    console.error(`missing id for ${name}`);
    process.exit(1);
  }
}

const legacy = await resolveBusinessTypeIds(["Restaurant/Cafe/Caterer"]);
const legacyId = legacy.get("Restaurant/Cafe/Caterer");
if (legacyId !== map.get("Restaurant/Cafe/Canteen")) {
  console.error("legacy Caterer label should resolve to same id as Canteen");
  process.exit(1);
}

console.log("fsa-finder.test: ok", {
  canteen: map.get("Restaurant/Cafe/Canteen"),
  legacyCaterer: legacyId,
});
