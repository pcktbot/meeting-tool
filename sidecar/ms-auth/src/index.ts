import { parseArgs } from "./args";
import { createPca, getToken, login, status } from "./auth";

function emit(result: unknown, exitCode = 0): void {
  // Exactly one JSON object on stdout; callers parse this.
  process.stdout.write(JSON.stringify(result));
  process.exitCode = exitCode;
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    emit({ error: "bad_args", message: (err as Error).message }, 1);
    return;
  }

  if (parsed.command !== "status" && !parsed.cachePath) {
    emit({ error: "bad_args", message: "--cache <path> is required" }, 1);
    return;
  }

  // status with no cache path = trivially not connected.
  if (parsed.command === "status" && !parsed.cachePath) {
    emit({ connected: false, account: null });
    return;
  }

  const pca = createPca(parsed.cachePath!);

  try {
    if (parsed.command === "status") {
      emit(await status(pca));
    } else if (parsed.command === "token") {
      const result = await getToken(pca);
      emit(result, "error" in result ? 2 : 0);
    } else {
      emit(await login(pca, parsed.deviceCode));
    }
  } catch (err) {
    emit({ error: "auth_failed", message: (err as Error).message }, 1);
  }
}

void main();
