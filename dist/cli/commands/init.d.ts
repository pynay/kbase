/**
 * init command — Initialize kbase in the current project.
 *
 * Creates .knowledge/ and its internal subdirectories, drops a
 * placeholder index.md, wires _cache/ into .gitignore, and prints
 * the agent-side setup instructions. Idempotent: running it twice
 * on the same directory is safe and will only fill in missing pieces.
 */
import type { Command } from "commander";
/**
 * Additively merge kbase hook entries into .claude/settings.json.
 * Returns true if hooks were added, false if already present.
 */
export declare function mergeHooksIntoSettings(settingsPath: string): Promise<boolean>;
/**
 * Register the `kb init` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=init.d.ts.map