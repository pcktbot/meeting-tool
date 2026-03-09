import { drizzle } from "drizzle-orm/sqlite-proxy";
import { invoke } from "@tauri-apps/api/core";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DbInstance | null = null;

export function getDb(): DbInstance {
  if (!dbInstance) {
    dbInstance = drizzle(
      async (sql, params, method) => {
        if (method === "run") {
          const result = await invoke<
            Record<string, unknown>[] | { changes: number }
          >("db_run", {
            sql,
            params: params ?? [],
          });

          // RETURNING clause returns array of rows
          if (Array.isArray(result)) {
            return { rows: result.map((row) => Object.values(row)) as any };
          }

          return { rows: [] as any };
        }

        // method is "all" or "get" or "values"
        const rows = await invoke<unknown>("db_execute", {
          sql,
          params: params ?? [],
          method,
        });

        if (method === "get") {
          // Single row as 1D array of values
          if (rows && typeof rows === "object" && !Array.isArray(rows)) {
            return { rows: Object.values(rows) as any };
          }
          return { rows: [] as any };
        }

        // "all" / "values" — array of rows, each row as array of values
        if (Array.isArray(rows)) {
          return { rows: rows.map((row) => Object.values(row)) as any };
        }

        return { rows: [] as any };
      },
      { schema },
    );
  }
  return dbInstance;
}

export { schema };
