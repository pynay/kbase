import { processWriteHook } from "../../hooks/hook-write.js";
export function register(program) {
    program
        .command("hook-write", { hidden: true })
        .description("(internal) Stop hook — dispatch kbase-writer if warranted")
        .action(async () => {
        try {
            const stdin = await readStdin();
            const payload = JSON.parse(stdin);
            await processWriteHook(payload);
        }
        catch {
            // Fail silently — never block the user's session
        }
    });
}
function readStdin() {
    return new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => resolve(data));
        process.stdin.on("error", reject);
        if (process.stdin.readableEnded)
            resolve(data);
    });
}
//# sourceMappingURL=hook-write.js.map