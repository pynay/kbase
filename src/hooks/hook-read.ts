import { findKnowledgeDir, readEntry, listEntryPaths } from "../core/store.js";
import { getModules, getFiles } from "../core/index.js";
import { formatEntryForPrompt } from "../cli/commands/_shared.js";
import { extractExplicitPaths } from "./path-extractor.js";
import { appendHookLog } from "./log.js";
import { loadHookConfig } from "./types.js";

interface ReadHookInput {
  prompt: string;
  cwd: string;
}

interface ReadHookOutput {
  additionalContext: string;
}

const MAX_ENTRIES = 3;

export async function processReadHook(input: ReadHookInput): Promise<ReadHookOutput | null> {
  const config = loadHookConfig();
  if (config.disabled) return null;

  const startMs = Date.now();
  let knowledgeDir: string | null;

  try {
    knowledgeDir = await findKnowledgeDir(input.cwd);
  } catch {
    return null;
  }
  if (!knowledgeDir) return null;

  try {
    const moduleIndex = await getModules(knowledgeDir);
    const fileIndex = await getFiles(knowledgeDir);
    const moduleNames = Object.keys(moduleIndex);

    if (moduleNames.length === 0) {
      await appendHookLog(knowledgeDir, {
        ts: new Date().toISOString(),
        event: "hook-read",
        gate: "skip",
        reason: "empty-index",
        latency_ms: Date.now() - startMs,
      });
      return null;
    }

    // Step 1: Try cheap path/symbol extraction
    const explicitPaths = extractExplicitPaths(input.prompt);
    const entryIds = new Set<string>();

    for (const path of explicitPaths) {
      // Try as file path (exact)
      if (fileIndex[path]) {
        for (const id of fileIndex[path]) entryIds.add(id);
      }
      // Try partial file path match
      for (const [indexedPath, ids] of Object.entries(fileIndex)) {
        if (indexedPath.endsWith(path) || indexedPath.includes(path)) {
          for (const id of ids) entryIds.add(id);
        }
      }
      // Try as module name
      if (moduleIndex[path]) {
        for (const id of moduleIndex[path]) entryIds.add(id);
      }
    }

    const resolution = "path-extraction";

    if (entryIds.size === 0) {
      await appendHookLog(knowledgeDir, {
        ts: new Date().toISOString(),
        event: "hook-read",
        gate: "skip",
        reason: "no-matches",
        latency_ms: Date.now() - startMs,
      });
      return null;
    }

    // Resolve entry IDs to full entries, cap at MAX_ENTRIES
    const allPaths = await listEntryPaths(knowledgeDir);
    const matchedPaths = allPaths.filter((p) => {
      const filename = p.split("/").pop()?.replace(".md", "") ?? "";
      return entryIds.has(filename);
    });

    const entries = [];
    for (const entryPath of matchedPaths.slice(0, MAX_ENTRIES)) {
      try {
        entries.push(await readEntry(entryPath));
      } catch {
        // skip unreadable entries
      }
    }

    if (entries.length === 0) return null;

    const additionalContext = [
      "## Relevant kbase knowledge entries (REQUIRED CONTEXT)\n",
      "The following entries describe load-bearing decisions about the files",
      "you're about to work with. You MUST consult them before making changes.",
      "If your plan contradicts an entry, surface that explicitly to the user —",
      "do not silently override.\n",
      ...entries.map((e) => formatEntryForPrompt(e) + "\n---\n"),
    ].join("\n");

    await appendHookLog(knowledgeDir, {
      ts: new Date().toISOString(),
      event: "hook-read",
      gate: "proceed",
      latency_ms: Date.now() - startMs,
      entries_injected: entries.length,
      resolution,
    });

    return { additionalContext };
  } catch {
    return null;
  }
}
