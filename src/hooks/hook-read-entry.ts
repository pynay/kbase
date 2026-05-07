import { processReadHook } from "./hook-read.js";
import type { UserPromptSubmitPayload, HookContextResponse } from "./types.js";

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
    if (process.stdin.readableEnded) resolve(data);
  });
}

async function main(): Promise<void> {
  try {
    const stdin = await readStdin();
    const payload: UserPromptSubmitPayload = JSON.parse(stdin);
    const result = await processReadHook({
      prompt: payload.prompt,
      cwd: payload.cwd,
    });
    if (result) {
      const response: HookContextResponse = {
        hookSpecificOutput: { additionalContext: result.additionalContext },
      };
      process.stdout.write(JSON.stringify(response));
    }
  } catch {
    // Fail silently — never block the user's prompt
  }
}

main();
