/**
 * Core data model for kbase.
 *
 * KnowledgeEntry is the fundamental unit — each entry maps to a single
 * markdown file with YAML frontmatter in .knowledge/. The interfaces here
 * are intentionally flat and serialization-friendly so they round-trip
 * cleanly between TypeScript, YAML frontmatter, and JSON indexes.
 */

// ---------------------------------------------------------------------------
// Knowledge entry — the primary data structure
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
  // Identity
  id: string;
  module: string;
  summary: string;
  timestamp: string; // ISO 8601
  agent: string;

  // The knowledge (body sections, stored as markdown below frontmatter)
  decision: string;
  alternatives?: string[];
  assumptions?: string[];
  risk?: string;

  // Code mapping
  files: string[];
  affects?: string[];
  depends_on?: string[];

  // Metadata
  supersedes?: string;
  tags?: string[];
}

/**
 * The subset of KnowledgeEntry stored in YAML frontmatter.
 * `decision`, `alternatives`, `assumptions`, and `risk` live in the
 * markdown body as H2 sections — they're free-form text that doesn't
 * belong in structured frontmatter.
 */
export type EntryFrontmatter = Omit<
  KnowledgeEntry,
  "decision" | "alternatives" | "assumptions" | "risk"
>;

// ---------------------------------------------------------------------------
// _graph/ index schemas
// ---------------------------------------------------------------------------

/** dependencies.json — module dependency graph (both directions). */
export interface DependencyIndex {
  [module: string]: {
    depends_on: string[];
    depended_on_by: string[];
  };
}

/** assumptions.json — assumptions grouped by module. */
export interface AssumptionEntry {
  assumption: string;
  entry_id: string;
}

export interface AssumptionIndex {
  [module: string]: AssumptionEntry[];
}

/** modules.json — module name → list of entry IDs. */
export interface ModuleIndex {
  [module: string]: string[];
}

/** files.json — file path → list of entry IDs that reference it. */
export interface FileIndex {
  [filePath: string]: string[];
}

// ---------------------------------------------------------------------------
// LLM configuration
// ---------------------------------------------------------------------------

export interface LLMConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface LLMRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  stream?: boolean;
}
