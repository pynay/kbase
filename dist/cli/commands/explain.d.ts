/**
 * explain command — LLM-powered walkthrough of a source file, grounded
 * in the knowledge base entries that document it.
 *
 * Pipeline:
 *   1. Read the target source file from disk.
 *   2. Look it up in files.json → direct knowledge entries.
 *   3. Pull one-hop related entries: entries in other modules whose
 *      affects/depends_on lists include any of the direct entries' modules.
 *   4. Build a prompt with source + both entry sets.
 *   5. Stream the LLM response to stdout.
 *
 * The one-hop boundary is deliberate. Transitive traversal blows up prompt
 * size fast and `kb impact` is the right command for full blast radius.
 * Here we just want "what context does a reader need to not misread this
 * file?", which one hop usually covers.
 */
import type { Command } from "commander";
/**
 * Register the `kb explain <file>` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=explain.d.ts.map