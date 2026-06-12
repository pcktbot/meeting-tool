export type Command = "login" | "token" | "status";

export interface ParsedArgs {
  command: Command;
  cachePath: string | undefined;
  deviceCode: boolean;
}

const COMMANDS: Command[] = ["login", "token", "status"];

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] as Command;
  if (!COMMANDS.includes(command)) {
    throw new Error(`Unknown command: ${argv[0]}`);
  }

  let cachePath: string | undefined;
  let deviceCode = false;

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--cache") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--cache requires a path value");
      }
      cachePath = value;
      i++;
    } else if (argv[i] === "--device-code") {
      deviceCode = true;
    }
  }

  return { command, cachePath, deviceCode };
}
