#!/usr/bin/env node
import { Command } from "commander";
import { runFindPipeline, printLeadSummary } from "../engine/pipeline.js";
import { closeDb } from "../engine/store/db.js";

const program = new Command();

program
  .name("passreadyfinder")
  .description("PassReady outbound lead finder — Phase A (find, enrich, score, store)");

program
  .command("find")
  .description("Find leads from FSA, score, enrich top N via OSM, store in Turso")
  .option("--skip-enrichment", "Skip OSM enrichment (FSA data only)")
  .action(async (options: { skipEnrichment?: boolean }) => {
    try {
      const result = await runFindPipeline({ skipEnrichment: options.skipEnrichment });
      console.log("\nSummary:");
      console.log(`  FSA matches (target rating): ${result.fetched}`);
      console.log(`  API rows scanned: ${result.apiRows}, delta rows: ${result.deltaRows}`);
      console.log(`  Stored in database:       ${result.stored}`);
      if (!options.skipEnrichment) {
        console.log(`  OSM enriched:             ${result.enriched}`);
        console.log(`  With phone:               ${result.withPhone}`);
        console.log(`  With website:             ${result.withWebsite}`);
      }
      await printLeadSummary(20);
    } finally {
      await closeDb();
    }
  });

program
  .command("list")
  .description("List top leads from the database sorted by lead_score")
  .option("-n, --limit <number>", "Number of leads to show", "20")
  .action(async (options: { limit: string }) => {
    try {
      const { runMigrations } = await import("../engine/store/db.js");
      await runMigrations();
      await printLeadSummary(parseInt(options.limit, 10));
    } finally {
      await closeDb();
    }
  });

program.parse();
