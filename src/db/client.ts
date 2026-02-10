import { PGlite } from "@electric-sql/pglite";

let pgliteInstance: PGlite | null = null;

export async function getPgliteClient(): Promise<PGlite> {
  if (!pgliteInstance) {
    pgliteInstance = new PGlite("idb://meeting-tool-db");
    await pgliteInstance.waitReady;
  }
  return pgliteInstance;
}
