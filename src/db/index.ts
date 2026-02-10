import { drizzle } from "drizzle-orm/pglite";
import { getPgliteClient } from "./client";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DbInstance | null = null;

export async function getDb(): Promise<DbInstance> {
  if (!dbInstance) {
    const client = await getPgliteClient();
    dbInstance = drizzle({ client, schema });
  }
  return dbInstance;
}

export { schema };
