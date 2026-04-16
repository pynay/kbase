/**
 * Entry point for the detached kbase-writer subprocess.
 * Invoked by hook-write via spawn().
 *
 * Args: [writerPayload JSON, hookConfig JSON]
 */
import { runWriter } from "./writer.js";
import type { WriterPayload, HookConfig } from "./types.js";

async function main(): Promise<void> {
  const [, , payloadJson, configJson] = process.argv;

  if (!payloadJson || !configJson) {
    process.exit(1);
  }

  try {
    const payload: WriterPayload = JSON.parse(payloadJson);
    const config: HookConfig = JSON.parse(configJson);
    await runWriter(payload, config);
  } catch {
    // Fail silently — this is a background process
  }

  process.exit(0);
}

main();
