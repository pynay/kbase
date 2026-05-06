import { Command } from "commander";
import { processReadHook } from "../../hooks/hook-read.js";
import type { UserPromptSubmitPayload, UserPromptSubmitResponse } from "../../hooks/types.js";

export function register(program: Command): void {
  program
    .command("hook-read", { hidden: true })
    .description("(internal) UserPromptSubmit hook — inject kbase context")
    .action(async () => {
      try {
        const stdin = await readStdin();
        const payload: UserPromptSubmitPayload = JSON.parse(stdin);

        const result = await processReadHook({
          prompt: payload.prompt,
          cwd: payload.cwd,
        });

        if (result) {
          const response: UserPromptSubmitResponse = {
            hookSpecificOutput: { additionalContext: result.additionalContext },
          };
          process.stdout.write(JSON.stringify(response));
        }
      } catch {
        // Fail silently — never block the user's prompt
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
