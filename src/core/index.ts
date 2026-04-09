/**
 * index.ts — Build and query _graph/ indexes.
 *
 * The _graph/ directory contains derived JSON indexes built from the
 * knowledge entry markdown files for fast lookups.
 */

import type {
  KnowledgeEntry,
  DependencyIndex,
  AssumptionIndex,
  ModuleIndex,
  FileIndex,
} from "./types.js";

/**
 * Build all four _graph/ indexes from parsed entries and write them to disk.
 */
export async function buildIndexes(
  knowledgeDir: string,
  entries?: KnowledgeEntry[]
): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Read the dependencies.json index (module dependency graph).
 */
export async function getDependencies(
  knowledgeDir: string
): Promise<DependencyIndex> {
  throw new Error("Not implemented");
}

/**
 * Read the assumptions.json index (assumptions grouped by module).
 */
export async function getAssumptions(
  knowledgeDir: string
): Promise<AssumptionIndex> {
  throw new Error("Not implemented");
}

/**
 * Read the modules.json index (module name to entry IDs).
 */
export async function getModules(
  knowledgeDir: string
): Promise<ModuleIndex> {
  throw new Error("Not implemented");
}

/**
 * Read the files.json index (file path to entry IDs).
 */
export async function getFiles(
  knowledgeDir: string
): Promise<FileIndex> {
  throw new Error("Not implemented");
}

/**
 * Regenerate .knowledge/index.md — a human-readable overview of the knowledge base.
 */
export async function generateIndexMd(
  knowledgeDir: string,
  entries?: KnowledgeEntry[]
): Promise<void> {
  throw new Error("Not implemented");
}
