/**
 * store.ts — Read/write .knowledge/ markdown files.
 *
 * Persistence layer for knowledge entries stored as markdown files
 * with YAML frontmatter in .knowledge/.
 */

import type { KnowledgeEntry } from "./types.js";

/**
 * Walk up from `startDir` (default: cwd) to find the nearest .knowledge/
 * directory. Returns the absolute path, or null if not found.
 */
export async function findKnowledgeDir(
  startDir: string = process.cwd()
): Promise<string | null> {
  throw new Error("Not implemented");
}

/**
 * Resolve the .knowledge/ directory or throw if not found.
 * Most commands call this at startup.
 */
export async function resolveKnowledgeDir(
  startDir?: string
): Promise<string> {
  throw new Error("Not implemented");
}

/**
 * Parse a single markdown file (with YAML frontmatter) into a KnowledgeEntry.
 */
export function parseEntry(filePath: string, raw: string): KnowledgeEntry {
  throw new Error("Not implemented");
}

/**
 * Serialize a KnowledgeEntry to a markdown string with YAML frontmatter.
 */
export function serializeEntry(entry: KnowledgeEntry): string {
  throw new Error("Not implemented");
}

/**
 * Read and parse a single entry file from disk.
 */
export async function readEntry(filePath: string): Promise<KnowledgeEntry> {
  throw new Error("Not implemented");
}

/**
 * List all entry .md file paths in .knowledge/, excluding internal dirs.
 */
export async function listEntryPaths(
  knowledgeDir: string
): Promise<string[]> {
  throw new Error("Not implemented");
}

/**
 * Read and parse all entries from .knowledge/.
 */
export async function readAllEntries(
  knowledgeDir: string
): Promise<KnowledgeEntry[]> {
  throw new Error("Not implemented");
}

/**
 * Write a new knowledge entry to disk. Returns the file path and generated ID.
 */
export async function writeEntry(
  knowledgeDir: string,
  entry: Omit<KnowledgeEntry, "id" | "timestamp" | "agent"> & {
    agent?: string;
  }
): Promise<{ path: string; id: string }> {
  throw new Error("Not implemented");
}
