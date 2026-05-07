import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
export async function appendHookLog(knowledgeDir, entry) {
    const cacheDir = join(knowledgeDir, "_cache");
    await mkdir(cacheDir, { recursive: true });
    const logPath = join(cacheDir, "hook.log");
    await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
}
//# sourceMappingURL=log.js.map