import {
  canonicalLocalAuthorityInput,
  LOCAL_AUTHORITY_INPUT_ALIASES,
  resolveLocalAuthorityIdLoose,
} from "./authorities.js";

const aliasCases: Array<{ in: string; want: string }> = [
  { in: "Blackburn with Darwen", want: "Blackburn" },
  { in: "  blackburn with darwen  ", want: "Blackburn" },
];

for (const c of aliasCases) {
  const got = canonicalLocalAuthorityInput(c.in);
  if (got !== c.want) {
    console.error(`canonicalLocalAuthorityInput(${JSON.stringify(c.in)}) = ${JSON.stringify(got)}, want ${JSON.stringify(c.want)}`);
    process.exit(1);
  }
}

if (!LOCAL_AUTHORITY_INPUT_ALIASES["blackburn with darwen"]) {
  console.error("missing blackburn with darwen alias");
  process.exit(1);
}

const live = process.argv.includes("--live");
if (live) {
  const resolved = await resolveLocalAuthorityIdLoose("Blackburn with Darwen");
  if (resolved.name !== "Blackburn" || resolved.id !== 195) {
    console.error(`live resolve: ${JSON.stringify(resolved)}`);
    process.exit(1);
  }
  console.log("authorities live: Blackburn with Darwen ->", resolved.name, resolved.id);
}

console.log("authorities.test: ok");
