import { processSessionStartHook } from "../../hooks/hook-session-start.js";
export function register(program) {
    program
        .command("hook-session-start", { hidden: true })
        .description("(internal) SessionStart hook — emit kbase framing message")
        .action(async () => {
        try {
            const stdin = await readStdin();
            const payload = JSON.parse(stdin);
            const result = await processSessionStartHook({ cwd: payload.cwd });
            if (result) {
                const response = {
                    hookSpecificOutput: { additionalContext: result.additionalContext },
                };
                process.stdout.write(JSON.stringify(response));
            }
        }
        catch {
            // Fail silently — never block session startup
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
//# sourceMappingURL=hook-session-start.js.map