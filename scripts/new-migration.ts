import { readdirSync, writeFileSync } from "fs";
import { join } from "path";

const migrationsDir = join(import.meta.dirname, "../src/db/migrations");
const name = process.argv[2];

if (!name) {
  console.error("Usage: bun run db:new-migration <name>");
  console.error("Example: bun run db:new-migration add_user_email");
  process.exit(1);
}

const existing = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const nextNum = String(existing.length + 1).padStart(4, "0");
const filename = `${nextNum}_${name}.sql`;
const filepath = join(migrationsDir, filename);

writeFileSync(filepath, "");
console.log(`Created: src/db/migrations/${filename}`);
