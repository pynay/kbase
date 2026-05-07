/**
 * Entry point for the detached kbase-writer subprocess.
 * Invoked by hook-write via spawn().
 *
 * Args: [writerPayload JSON, hookConfig JSON]
 */
import { runWriter } from "./writer.js";
async function main() {
    const [, , payloadJson, configJson] = process.argv;
    if (!payloadJson || !configJson) {
        process.exit(1);
    }
    try {
        const payload = JSON.parse(payloadJson);
        const config = JSON.parse(configJson);
        await runWriter(payload, config);
    }
    catch {
        // Fail silently — this is a background process
    }
    process.exit(0);
}
main();
//# sourceMappingURL=writer-entry.js.map