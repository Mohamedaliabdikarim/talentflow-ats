import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { applyLocalSchema, startLocalCluster } from "./local-schema";

/**
 * Generates src/lib/supabase/database.types.ts in the shape supabase-js expects
 * (`Database["public"]["Tables" | "Enums" | "Functions"]`) by applying the migrations to an
 * embedded PostgreSQL and reading the catalog. Written because `supabase gen types --db-url`
 * exits without output on this machine (no Docker). Once the hosted project carries the
 * same migrations, the CLI or MCP output can be diffed against this file.
 */
const OUTPUT = path.resolve("src/lib/supabase/database.types.ts");
const DATABASE_NAME = "talentflow_types";

type ColumnRow = {
  table_name: string;
  column_name: string;
  udt_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_identity: "YES" | "NO";
  identity_generation: "ALWAYS" | "BY DEFAULT" | null;
};

type ForeignKeyRow = {
  conname: string;
  table_name: string;
  referenced_table: string;
  columns: string[];
  referenced_columns: string[];
  is_one_to_one: boolean;
};

type FunctionRow = {
  proname: string;
  result_type: string;
  arg_names: string[] | null;
  arg_types: string[] | null;
  num_defaults: number;
};

function scalarType(udt: string, enums: Map<string, string[]>): string {
  if (enums.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
  switch (udt) {
    case "uuid":
    case "text":
    case "varchar":
    case "bpchar":
    case "citext":
    case "timestamptz":
    case "timestamp":
    case "date":
    case "time":
    case "timetz":
    case "interval":
    case "inet":
      return "string";
    case "int2":
    case "int4":
    case "int8":
    case "float4":
    case "float8":
    case "numeric":
      return "number";
    case "bool":
      return "boolean";
    case "json":
    case "jsonb":
      return "Json";
    default:
      return "unknown";
  }
}

function columnType(column: ColumnRow, enums: Map<string, string[]>): string {
  if (column.data_type === "ARRAY") {
    return `${scalarType(column.udt_name.replace(/^_/, ""), enums)}[]`;
  }
  return scalarType(column.udt_name, enums);
}

/** SQL type names as printed by format_type(), used for function signatures. */
function sqlTypeToTs(sqlType: string, enums: Map<string, string[]>): string {
  const base = sqlType.replace(/\[\]$/, "");
  const isArray = sqlType.endsWith("[]");
  let ts: string;
  if (enums.has(base)) ts = `Database["public"]["Enums"]["${base}"]`;
  else if (
    [
      "text",
      "uuid",
      "character varying",
      "character",
      "timestamp with time zone",
      "timestamp without time zone",
      "date",
    ].includes(base)
  )
    ts = "string";
  else if (["integer", "bigint", "smallint", "numeric", "real", "double precision"].includes(base))
    ts = "number";
  else if (base === "boolean") ts = "boolean";
  else if (base === "json" || base === "jsonb") ts = "Json";
  else if (base === "void") ts = "undefined";
  else ts = "unknown";
  return isArray ? `${ts}[]` : ts;
}

async function main(): Promise<void> {
  const cluster = await startLocalCluster();
  try {
    await cluster.createDatabase(DATABASE_NAME);
    const url = cluster.urlFor(DATABASE_NAME);
    // Always the committed migrations only: types never describe an unapproved proposal.
    const applied = await applyLocalSchema(url, { hostedLike: false });
    console.info(`[db:types] applied ${applied.migrations.length} migration(s)`);

    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const enumRows = await client.query<{ typname: string; labels: string[] }>(
        `select t.typname::text, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
           from pg_type t
           join pg_enum e on e.enumtypid = t.oid
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public'
          group by t.typname
          order by t.typname`,
      );
      const enums = new Map(enumRows.rows.map((row) => [row.typname, row.labels]));

      const tableRows = await client.query<{ table_name: string }>(
        `select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
      );
      const columnRows = await client.query<ColumnRow>(
        `select table_name, column_name, udt_name, data_type, is_nullable, column_default,
                is_identity, identity_generation
           from information_schema.columns
          where table_schema = 'public'
          order by table_name, ordinal_position`,
      );
      const fkRows = await client.query<ForeignKeyRow>(
        `select c.conname::text,
                cl.relname::text as table_name,
                fcl.relname::text as referenced_table,
                (select array_agg(a.attname::text order by k.ord)
                   from unnest(c.conkey) with ordinality k(attnum, ord)
                   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns,
                (select array_agg(a.attname::text order by k.ord)
                   from unnest(c.confkey) with ordinality k(attnum, ord)
                   join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as referenced_columns,
                exists (select 1 from pg_constraint u
                         where u.conrelid = c.conrelid and u.contype in ('p', 'u')
                           and u.conkey <@ c.conkey and c.conkey <@ u.conkey) as is_one_to_one
           from pg_constraint c
           join pg_class cl on cl.oid = c.conrelid
           join pg_namespace n on n.oid = cl.relnamespace
           join pg_class fcl on fcl.oid = c.confrelid
          where c.contype = 'f' and n.nspname = 'public'
          order by cl.relname, c.conname`,
      );
      const functionRows = await client.query<FunctionRow>(
        `select p.proname::text,
                pg_get_function_result(p.oid) as result_type,
                p.proargnames as arg_names,
                (select array_agg(format_type(t, null) order by ord)
                   from unnest(p.proargtypes) with ordinality u(t, ord)) as arg_types,
                p.pronargdefaults as num_defaults
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prokind = 'f'
          order by p.proname`,
      );

      const lines: string[] = [];
      lines.push("// Generated by `pnpm db:types` from supabase/migrations. Do not edit by hand.");
      lines.push("");
      lines.push(
        "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
      );
      lines.push("");
      lines.push("export type Database = {");
      lines.push('  __InternalSupabase: { PostgrestVersion: "13" };');
      lines.push("  public: {");
      lines.push("    Tables: {");
      for (const { table_name } of tableRows.rows) {
        const columns = columnRows.rows.filter((column) => column.table_name === table_name);
        lines.push(`      ${table_name}: {`);
        lines.push("        Row: {");
        for (const column of columns) {
          const nullable = column.is_nullable === "YES" ? " | null" : "";
          lines.push(`          ${column.column_name}: ${columnType(column, enums)}${nullable};`);
        }
        lines.push("        };");
        lines.push("        Insert: {");
        for (const column of columns) {
          if (column.identity_generation === "ALWAYS") {
            lines.push(`          ${column.column_name}?: never;`);
            continue;
          }
          const optional =
            column.is_nullable === "YES" ||
            column.column_default !== null ||
            column.is_identity === "YES";
          const nullable = column.is_nullable === "YES" ? " | null" : "";
          lines.push(
            `          ${column.column_name}${optional ? "?" : ""}: ${columnType(column, enums)}${nullable};`,
          );
        }
        lines.push("        };");
        lines.push("        Update: {");
        for (const column of columns) {
          if (column.identity_generation === "ALWAYS") {
            lines.push(`          ${column.column_name}?: never;`);
            continue;
          }
          const nullable = column.is_nullable === "YES" ? " | null" : "";
          lines.push(`          ${column.column_name}?: ${columnType(column, enums)}${nullable};`);
        }
        lines.push("        };");
        const fks = fkRows.rows.filter((fk) => fk.table_name === table_name);
        lines.push("        Relationships: [");
        for (const fk of fks) {
          lines.push("          {");
          lines.push(`            foreignKeyName: "${fk.conname}";`);
          lines.push(`            columns: [${fk.columns.map((c) => `"${c}"`).join(", ")}];`);
          lines.push(`            isOneToOne: ${fk.is_one_to_one};`);
          lines.push(`            referencedRelation: "${fk.referenced_table}";`);
          lines.push(
            `            referencedColumns: [${fk.referenced_columns.map((c) => `"${c}"`).join(", ")}];`,
          );
          lines.push("          },");
        }
        lines.push("        ];");
        lines.push("      };");
      }
      lines.push("    };");
      lines.push("    Views: { [_ in never]: never };");
      lines.push("    Functions: {");
      for (const fn of functionRows.rows) {
        if (fn.result_type === "trigger") continue;
        const argNames = fn.arg_names ?? [];
        const argTypes = fn.arg_types ?? [];
        const firstOptional = argNames.length - fn.num_defaults;
        lines.push(`      ${fn.proname}: {`);
        if (argNames.length === 0) {
          lines.push("        Args: Record<PropertyKey, never>;");
        } else {
          lines.push("        Args: {");
          argNames.forEach((name, index) => {
            const optional = index >= firstOptional ? "?" : "";
            lines.push(
              `          ${name}${optional}: ${sqlTypeToTs(argTypes[index] ?? "", enums)};`,
            );
          });
          lines.push("        };");
        }
        lines.push(`        Returns: ${sqlTypeToTs(fn.result_type, enums)};`);
        lines.push("      };");
      }
      lines.push("    };");
      lines.push("    Enums: {");
      for (const [name, labels] of enums) {
        lines.push(`      ${name}: ${labels.map((label) => `"${label}"`).join(" | ")};`);
      }
      lines.push("    };");
      lines.push("    CompositeTypes: { [_ in never]: never };");
      lines.push("  };");
      lines.push("};");
      lines.push("");
      lines.push('export type Tables<T extends keyof Database["public"]["Tables"]> =');
      lines.push('  Database["public"]["Tables"][T]["Row"];');
      lines.push('export type TablesInsert<T extends keyof Database["public"]["Tables"]> =');
      lines.push('  Database["public"]["Tables"][T]["Insert"];');
      lines.push('export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =');
      lines.push('  Database["public"]["Tables"][T]["Update"];');
      lines.push('export type Enums<T extends keyof Database["public"]["Enums"]> =');
      lines.push('  Database["public"]["Enums"][T];');
      lines.push("");

      await writeFile(OUTPUT, lines.join("\n"));
      spawnSync("pnpm", ["exec", "prettier", "--write", OUTPUT], { shell: true, stdio: "ignore" });
      console.info(
        `[db:types] wrote ${path.relative(process.cwd(), OUTPUT)} (${tableRows.rows.length} tables, ${enums.size} enums)`,
      );
    } finally {
      await client.end();
    }
  } finally {
    await cluster.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
