import { drizzle } from "drizzle-orm/sqlite-proxy";
import { invoke } from "@tauri-apps/api/core";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DbInstance | null = null;

// Extract column order from SQL to ensure correct value ordering
function extractColumns(sql: string): string[] | null {
  // Try RETURNING clause first (for INSERT/UPDATE/DELETE)
  const returningMatch = sql.match(/RETURNING\s+(.+)$/i);
  if (returningMatch) {
    return parseColumnList(returningMatch[1]);
  }
  
  // Try SELECT clause
  const selectMatch = sql.match(/^SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch) {
    return parseColumnList(selectMatch[1]);
  }
  
  return null;
}

// Parse a comma-separated list of column identifiers
function parseColumnList(columnStr: string): string[] {
  const columns: string[] = [];
  let current = "";
  let depth = 0;
  
  for (const char of columnStr) {
    if (char === "(" ) {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      columns.push(extractColumnName(current.trim()));
      current = "";
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    columns.push(extractColumnName(current.trim()));
  }
  
  return columns;
}

// Extract the actual column name, handling aliases and quoted identifiers
function extractColumnName(col: string): string {
  // Handle "table"."column" -> column
  const dotMatch = col.match(/\."([^"]+)"$/);
  if (dotMatch) {
    return dotMatch[1];
  }
  
  // Handle "column" -> column
  if (col.startsWith('"') && col.endsWith('"')) {
    return col.slice(1, -1);
  }
  
  // Handle table.column -> column
  const simpleDot = col.split(".");
  if (simpleDot.length > 1) {
    return simpleDot[simpleDot.length - 1].replace(/"/g, "");
  }
  
  return col.replace(/"/g, "");
}

// Convert a row object to an array of values in the specified column order
function rowToOrderedValues(
  row: Record<string, unknown>,
  columns: string[],
): unknown[] {
  return columns.map((col) => row[col]);
}

export function getDb(): DbInstance {
  if (!dbInstance) {
    dbInstance = drizzle(
      async (sql, params, method) => {
        console.log("[db] Executing:", method, sql.substring(0, 150));
        console.log("[db] Params:", JSON.stringify(params));
        
        if (method === "run") {
          const result = await invoke<
            Record<string, unknown>[] | { changes: number }
          >("db_run", {
            sql,
            params: params ?? [],
          });
          
          console.log("[db] Run result:", JSON.stringify(result));

          // RETURNING clause returns array of rows
          if (Array.isArray(result)) {
            const columns = extractColumns(sql);
            console.log("[db] Columns:", columns);
            
            if (columns) {
              const rows = result.map((row) => rowToOrderedValues(row, columns));
              console.log("[db] Ordered rows:", JSON.stringify(rows));
              return { rows: rows as any };
            }
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
        
        console.log("[db] Execute result:", JSON.stringify(rows));

        if (method === "get") {
          if (rows && typeof rows === "object" && !Array.isArray(rows)) {
            const columns = extractColumns(sql);
            if (columns) {
              return { rows: rowToOrderedValues(rows as Record<string, unknown>, columns) as any };
            }
            return { rows: Object.values(rows) as any };
          }
          return { rows: [] as any };
        }

        // "all" / "values" — array of rows, each row as array of values
        if (Array.isArray(rows)) {
          const columns = extractColumns(sql);
          if (columns) {
            return { rows: (rows as Record<string, unknown>[]).map((row) => rowToOrderedValues(row, columns)) as any };
          }
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
