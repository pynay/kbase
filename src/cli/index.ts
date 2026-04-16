#!/usr/bin/env node
/**
 * CLI entry point for kbase.
 *
 * Sets up commander with all subcommands registered.
 */

import { Command } from "commander";
import { register as registerExplain } from "./commands/explain.js";
import { register as registerImpact } from "./commands/impact.js";
import { register as registerAsk } from "./commands/ask.js";
import { register as registerDeps } from "./commands/deps.js";
import { register as registerAssumptions } from "./commands/assumptions.js";
import { register as registerHistory } from "./commands/history.js";
import { register as registerSearch } from "./commands/search.js";
import { register as registerStale } from "./commands/stale.js";
import { register as registerInit } from "./commands/init.js";
import { register as registerReindex } from "./commands/reindex.js";
import { register as registerHookRead } from "./commands/hook-read.js";
import { register as registerHookWrite } from "./commands/hook-write.js";

const program = new Command();

program
  .name("kb")
  .description("kbase — a knowledge base for your codebase")
  .version("0.1.0");

registerExplain(program);
registerImpact(program);
registerAsk(program);
registerDeps(program);
registerAssumptions(program);
registerHistory(program);
registerSearch(program);
registerStale(program);
registerInit(program);
registerReindex(program);
registerHookRead(program);
registerHookWrite(program);

program.parse();
