import { Command } from "commander";
import { processSessionStartHook } from "../../hooks/hook-session-start.js";
import type { SessionStartPayload, HookContextResponse } from "../../hooks/types.js";

export function register(program: Command): void {
  program
    .command("hook-session-start", { hidden: true })
    .description("(internal) SessionStart hook — emit kbase framing message")
    .action(async () => {
      try {
        const stdin = await readStdin();
        const payload: SessionStartPayload = JSON.parse(stdin);

        const result = await processSessionStartHook({ cwd: payload.cwd });

        if (result) {
          const response: HookContextResponse = {
            hookSpecificOutput: { additionalContext: result.additionalContext },
          };
          process.stdout.write(JSON.stringify(response));
        }
      } catch {
        // Fail silently — never block session startup
      }
    });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
    if (process.stdin.readableEnded) resolve(data);
  });
}
