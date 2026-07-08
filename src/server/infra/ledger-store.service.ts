import { Injectable, OnModuleInit } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { AppUser, Dataset, DatasetField, LedgerLog, LedgerRecord } from "../core/types.js";
import type { FieldValue } from "../core/types.js";
import { rowsToDataset, stringifyCell } from "../core/ledger-utils.js";

const { Pool } = pg;
const root = fileURLToPath(new URL("../../../", import.meta.url));
const dataDir = resolve(root, "data");
const dataPath = resolve(dataDir, "project-data.json");
const ledgerLogPath = resolve(dataDir, "ledger-logs.json");

function toJsonb(value: unknown): string {
  return JSON.stringify(value ?? null);
}

@Injectable()
export class LedgerStoreService implements OnModuleInit {
  private pool: pg.Pool | null = null;
  private postgresReady = false;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) return;
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await this.pool.query("select 1");
      await this.ensureSchema();
      this.postgresReady = true;
      await this.seedIfEmpty();
      console.log("Ledger store connected to PostgreSQL");
    } catch (error) {
      this.postgresReady = false;
      console.warn(`PostgreSQL unavailable, falling back to JSON: ${(error as Error).message}`);
    }
  }

  async readDataset(): Promise<Dataset> {
    if (this.postgresReady && this.pool) {
      const [stateResult, recordResult] = await Promise.all([
        this.pool.query("select key, value from app_state where key in ('meta', 'fields')"),
        this.pool.query("select record_id, fields from ledger_records order by sort_order asc, record_id asc")
      ]);
      const state = Object.fromEntries(stateResult.rows.map((row) => [row.key, row.value]));
      return {
        meta: state.meta || {},
        fields: state.fields || [],
        records: recordResult.rows.map((row) => ({ record_id: row.record_id, fields: row.fields || {} }))
      };
    }
    return existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, "utf8")) as Dataset : rowsToDataset([], "");
  }

  async saveDataset(dataset: Dataset): Promise<void> {
    if (this.postgresReady && this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await client.query("delete from ledger_records");
        await client.query(
          `insert into app_state(key, value) values ('meta', $1::jsonb), ('fields', $2::jsonb)
           on conflict (key) do update set value = excluded.value`,
          [toJsonb(dataset.meta || {}), toJsonb(dataset.fields || [])]
        );
        for (const [index, record] of (dataset.records || []).entries()) {
          await client.query(
            `insert into ledger_records(record_id, fields, sort_order, updated_at)
             values ($1, $2::jsonb, $3, now())
             on conflict (record_id) do update set fields = excluded.fields, sort_order = excluded.sort_order, updated_at = now()`,
            [record.record_id, toJsonb(record.fields || {}), index]
          );
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      return;
    }
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(dataPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  }

  async appendRecord(record: LedgerRecord): Promise<Dataset> {
    const dataset = await this.readDataset();
    dataset.records = [...(dataset.records || []), record];
    await this.saveDataset(dataset);
    return dataset;
  }

  async appendRecordToFront(record: LedgerRecord): Promise<Dataset> {
    const dataset = await this.readDataset();
    dataset.records = [record, ...(dataset.records || [])];
    await this.saveDataset(dataset);
    return dataset;
  }

  async updateRecord(recordId: string, fields: Record<string, FieldValue>): Promise<{ dataset: Dataset; beforeFields: Record<string, FieldValue>; record: LedgerRecord | null }> {
    const dataset = await this.readDataset();
    const record = dataset.records.find((item) => item.record_id === recordId) || null;
    if (!record) return { dataset, beforeFields: {}, record: null };
    const beforeFields: Record<string, FieldValue> = { ...(record.fields || {}) };
    record.fields = { ...(record.fields || {}), ...fields };
    dataset.meta = {
      ...(dataset.meta || {}),
      status: "ok",
      syncedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      message: `已更新 ${String(record.fields["项目名称"] || record.record_id)}`
    };
    await this.saveDataset(dataset);
    return { dataset, beforeFields, record };
  }

  async readLogs(recordId: string): Promise<LedgerLog[]> {
    if (this.postgresReady && this.pool) {
      const result = await this.pool.query(
        `select id, record_id, type, field, before_value as before, after_value as after,
                actor, role, note, created_at_text as "createdAt"
         from ledger_logs where record_id = $1 order by created_at desc`,
        [recordId]
      );
      return result.rows;
    }
    const logs = existsSync(ledgerLogPath) ? JSON.parse(readFileSync(ledgerLogPath, "utf8")) as LedgerLog[] : [];
    return logs.filter((log) => log.record_id === recordId);
  }

  async appendLog(log: LedgerLog): Promise<void> {
    if (this.postgresReady && this.pool) {
      await this.pool.query(
        `insert into ledger_logs(id, record_id, type, field, before_value, after_value, actor, role, note, created_at_text)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [log.id, log.record_id, log.type, log.field, log.before, log.after, log.actor, log.role, log.note, log.createdAt]
      );
      return;
    }
    mkdirSync(dataDir, { recursive: true });
    const logs = existsSync(ledgerLogPath) ? JSON.parse(readFileSync(ledgerLogPath, "utf8")) as LedgerLog[] : [];
    logs.unshift(log);
    writeFileSync(ledgerLogPath, `${JSON.stringify(logs, null, 2)}\n`, "utf8");
  }

  async appendFieldChangeLogs(recordId: string, beforeFields: Record<string, FieldValue>, afterFields: Record<string, FieldValue>, actor: string, role: string, note = "") {
    const { createLog } = await import("../core/ledger-utils.js");
    for (const [field, after] of Object.entries(afterFields || {})) {
      const before = stringifyCell(beforeFields?.[field]);
      const next = stringifyCell(after);
      if (before !== next) {
        await this.appendLog(createLog({ record_id: recordId, type: "字段更新", field, before, after: next, actor, role, note }));
      }
    }
  }

  isPostgresReady(): boolean {
    return this.postgresReady;
  }

  async upsertUser(user: AppUser): Promise<void> {
    if (this.postgresReady && this.pool) {
      await this.pool.query(
        `insert into app_users(open_id, name, email, avatar, department, role, last_login_at)
         values ($1,$2,$3,$4,$5,$6,now())
         on conflict (open_id) do update set
           name = excluded.name,
           email = excluded.email,
           avatar = excluded.avatar,
           department = excluded.department,
           role = excluded.role,
           last_login_at = now()`,
        [user.openId, user.name, user.email, user.avatar || "", user.department, user.role]
      );
    }
  }

  private async ensureSchema() {
    if (!this.pool) return;
    await this.pool.query(`
      create table if not exists app_state (
        key text primary key,
        value jsonb not null
      );

      create table if not exists ledger_records (
        record_id text primary key,
        fields jsonb not null,
        sort_order integer not null default 0,
        updated_at timestamptz not null default now()
      );

      create table if not exists ledger_logs (
        id text primary key,
        record_id text not null,
        type text not null,
        field text not null default '',
        before_value text not null default '',
        after_value text not null default '',
        actor text not null default '',
        role text not null default '',
        note text not null default '',
        created_at_text text not null default '',
        created_at timestamptz not null default now()
      );

      create table if not exists app_users (
        open_id text primary key,
        name text not null,
        email text not null default '',
        avatar text not null default '',
        department text not null default '',
        role text not null,
        created_at timestamptz not null default now(),
        last_login_at timestamptz not null default now()
      );

      create index if not exists idx_ledger_logs_record_id on ledger_logs(record_id);
      create index if not exists idx_ledger_records_fields_gin on ledger_records using gin(fields);
      create index if not exists idx_app_users_role on app_users(role);
    `);
  }

  private async seedIfEmpty() {
    if (!this.pool) return;
    const countResult = await this.pool.query("select count(*)::int as count from ledger_records");
    if (countResult.rows[0]?.count > 0 || !existsSync(dataPath)) return;
    const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as Dataset;
    await this.saveDataset(dataset);
    const logs = existsSync(ledgerLogPath) ? JSON.parse(readFileSync(ledgerLogPath, "utf8")) as LedgerLog[] : [];
    for (const log of logs) await this.appendLog(log);
  }
}
