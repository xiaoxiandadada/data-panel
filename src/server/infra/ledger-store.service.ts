import { Injectable, OnModuleInit } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import type { AppUser, Dataset, ImportBatch, LedgerLog, LedgerRecord, NotificationLog, UserFieldPreferences, UserRole } from "../core/types.js";
import type { FieldValue } from "../core/types.js";
import { rowsToDataset, stringifyCell } from "../core/ledger-utils.js";
import { normalizeUserRoles, primaryUserRole } from "../core/user-roles.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || resolve(root, "data"));
const dataPath = resolve(dataDir, "project-data.json");
const ledgerLogPath = resolve(dataDir, "ledger-logs.json");
const preferencePath = resolve(dataDir, "user-field-preferences.json");
const importBatchPath = resolve(dataDir, "import-batches.json");
const notificationLogPath = resolve(dataDir, "notification-logs.json");

type AppStateDoc = Document & {
  key: "meta" | "fields";
  value: unknown;
};

type LedgerRecordDoc = Document & {
  record_id: string;
  fields: Record<string, FieldValue>;
  sort_order: number;
  updated_at: Date;
};

type LedgerLogDoc = Document & LedgerLog & {
  created_at: Date;
};

type AppUserDoc = Document & AppUser & {
  created_at: Date;
  last_login_at: Date;
};

type UserFieldPreferenceDoc = Document & UserFieldPreferences;
type ImportBatchDoc = Document & ImportBatch & { created_at: Date };
type NotificationLogDoc = Document & NotificationLog & { created_at: Date };

@Injectable()
export class LedgerStoreService implements OnModuleInit {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private mongoReady = false;

  async onModuleInit() {
    const mongoUri = this.mongoUri();
    if (!mongoUri) return;
    this.client = new MongoClient(mongoUri, {
      appName: "delivery-pipeline"
    });
    try {
      await this.client.connect();
      this.db = this.client.db(process.env.MONGODB_DB || "delivery_pipeline");
      await this.db.command({ ping: 1 });
      await this.ensureIndexes();
      this.mongoReady = true;
      await this.seedIfEmpty();
      console.log("Ledger store connected to MongoDB");
    } catch (error) {
      this.mongoReady = false;
      console.warn(`MongoDB unavailable, falling back to JSON: ${(error as Error).message}`);
    }
  }

  async readDataset(): Promise<Dataset> {
    if (this.mongoReady && this.db) {
      const [stateDocs, recordDocs] = await Promise.all([
        this.appState().find({ key: { $in: ["meta", "fields"] } }).toArray(),
        this.ledgerRecords().find({}).sort({ sort_order: 1, record_id: 1 }).toArray()
      ]);
      const state = Object.fromEntries(stateDocs.map((row) => [row.key, row.value]));
      return {
        meta: (state.meta || {}) as Dataset["meta"],
        fields: (state.fields || []) as Dataset["fields"],
        records: recordDocs.map((row) => ({ record_id: row.record_id, fields: row.fields || {} }))
      };
    }
    return existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, "utf8")) as Dataset : rowsToDataset([], "");
  }

  async saveDataset(dataset: Dataset): Promise<void> {
    if (this.mongoReady && this.db) {
      await this.appState().bulkWrite([
        {
          updateOne: {
            filter: { key: "meta" },
            update: { $set: { key: "meta", value: dataset.meta || {} } },
            upsert: true
          }
        },
        {
          updateOne: {
            filter: { key: "fields" },
            update: { $set: { key: "fields", value: dataset.fields || [] } },
            upsert: true
          }
        }
      ]);
      await this.ledgerRecords().deleteMany({});
      const docs = (dataset.records || []).map((record, index) => ({
        record_id: record.record_id,
        fields: record.fields || {},
        sort_order: index,
        updated_at: new Date()
      }));
      if (docs.length) await this.ledgerRecords().insertMany(docs);
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
    if (this.mongoReady && this.db) {
      const logs = await this.ledgerLogs()
        .find({ record_id: recordId }, { projection: { _id: 0, created_at: 0 } })
        .sort({ created_at: -1 })
        .toArray();
      return logs.map((log) => ({
        id: log.id,
        record_id: log.record_id,
        type: log.type,
        field: log.field,
        before: log.before,
        after: log.after,
        actor: log.actor,
        role: log.role,
        note: log.note,
        createdAt: log.createdAt
      }));
    }
    const logs = existsSync(ledgerLogPath) ? JSON.parse(readFileSync(ledgerLogPath, "utf8")) as LedgerLog[] : [];
    return logs.filter((log) => log.record_id === recordId);
  }

  async appendLog(log: LedgerLog): Promise<void> {
    if (this.mongoReady && this.db) {
      await this.ledgerLogs().updateOne(
        { id: log.id },
        {
          $set: {
            ...log,
            created_at: new Date()
          }
        },
        { upsert: true }
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

  isMongoReady(): boolean {
    return this.mongoReady;
  }

  async upsertUser(user: AppUser): Promise<void> {
    if (this.mongoReady && this.db) {
      const now = new Date();
      const existing = await this.appUsers().findOne({ openId: user.openId });
      const roles = normalizeUserRoles([
        ...((existing?.roles as UserRole[] | undefined) || []),
        ...(user.roles || []),
        user.role
      ]);
      const role = primaryUserRole(roles);
      const { role: _incomingRole, roles: _incomingRoles, ...profile } = user;
      await this.appUsers().updateOne(
        { openId: user.openId },
        {
          $set: {
            ...profile,
            role,
            roles,
            last_login_at: now
          },
          $setOnInsert: {
            created_at: now
          }
        },
        { upsert: true }
      );
    }
  }

  async listUsers(): Promise<AppUser[]> {
    if (!this.mongoReady || !this.db) return [];
    const users = await this.appUsers()
      .find({}, { projection: { _id: 0, created_at: 0, last_login_at: 0 } })
      .sort({ name: 1 })
      .toArray() as unknown as AppUser[];
    return users.map((user) => this.normalizeStoredUser(user));
  }

  async findUserByOpenId(openId: string): Promise<AppUser | null> {
    if (!this.mongoReady || !this.db) return null;
    const user = await this.appUsers().findOne(
      { openId },
      { projection: { _id: 0, created_at: 0, last_login_at: 0 } }
    ) as AppUser | null;
    return user ? this.normalizeStoredUser(user) : null;
  }

  async findUsersByNames(names: string[]): Promise<AppUser[]> {
    const cleanNames = [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
    if (!cleanNames.length || !this.mongoReady || !this.db) return [];
    const users = await this.appUsers()
      .find({ name: { $in: cleanNames } }, { projection: { _id: 0, created_at: 0, last_login_at: 0 } })
      .toArray() as unknown as AppUser[];
    return users.map((user) => this.normalizeStoredUser(user));
  }

  async updateUserRoles(openId: string, requestedRoles: UserRole[]): Promise<AppUser | null> {
    if (!this.mongoReady || !this.db) return null;
    const roles = normalizeUserRoles(requestedRoles);
    const updated = await this.appUsers().findOneAndUpdate(
      { openId },
      { $set: { role: primaryUserRole(roles), roles } },
      { returnDocument: "after", projection: { _id: 0, created_at: 0, last_login_at: 0 } }
    );
    return updated ? this.normalizeStoredUser(updated as AppUser) : null;
  }

  async updateUserRole(openId: string, role: UserRole): Promise<AppUser | null> {
    return this.updateUserRoles(openId, [role]);
  }

  async readUserFieldPreferences(openId: string): Promise<UserFieldPreferences> {
    const fallback: UserFieldPreferences = { openId, hiddenFields: [], fieldOrder: [], updatedAt: "" };
    if (this.mongoReady && this.db) {
      const stored = await this.userFieldPreferences().findOne({ openId }, { projection: { _id: 0 } });
      return stored ? { ...fallback, ...stored } as UserFieldPreferences : fallback;
    }
    const all = existsSync(preferencePath) ? JSON.parse(readFileSync(preferencePath, "utf8")) as UserFieldPreferences[] : [];
    return all.find((item) => item.openId === openId) || fallback;
  }

  async saveUserFieldPreferences(preferences: UserFieldPreferences): Promise<UserFieldPreferences> {
    const normalized: UserFieldPreferences = {
      openId: preferences.openId,
      hiddenFields: [...new Set(preferences.hiddenFields || [])],
      fieldOrder: [...new Set(preferences.fieldOrder || [])],
      updatedAt: new Date().toISOString()
    };
    if (this.mongoReady && this.db) {
      await this.userFieldPreferences().updateOne({ openId: normalized.openId }, { $set: normalized }, { upsert: true });
      return normalized;
    }
    mkdirSync(dataDir, { recursive: true });
    const all = existsSync(preferencePath) ? JSON.parse(readFileSync(preferencePath, "utf8")) as UserFieldPreferences[] : [];
    const next = [...all.filter((item) => item.openId !== normalized.openId), normalized];
    writeFileSync(preferencePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return normalized;
  }

  async appendImportBatch(batch: ImportBatch): Promise<void> {
    if (this.mongoReady && this.db) {
      await this.importBatches().updateOne({ id: batch.id }, { $set: { ...batch, created_at: new Date() } }, { upsert: true });
      return;
    }
    mkdirSync(dataDir, { recursive: true });
    const all = existsSync(importBatchPath) ? JSON.parse(readFileSync(importBatchPath, "utf8")) as ImportBatch[] : [];
    writeFileSync(importBatchPath, `${JSON.stringify([batch, ...all].slice(0, 500), null, 2)}\n`, "utf8");
  }

  async readImportBatches(limit = 50): Promise<ImportBatch[]> {
    if (this.mongoReady && this.db) {
      return this.importBatches()
        .find({}, { projection: { _id: 0, created_at: 0 } })
        .sort({ created_at: -1 })
        .limit(Math.min(Math.max(limit, 1), 200))
        .toArray() as Promise<ImportBatch[]>;
    }
    const all = existsSync(importBatchPath) ? JSON.parse(readFileSync(importBatchPath, "utf8")) as ImportBatch[] : [];
    return all.slice(0, limit);
  }

  async appendNotificationLog(log: NotificationLog): Promise<void> {
    if (this.mongoReady && this.db) {
      await this.notificationLogs().updateOne({ id: log.id }, { $set: { ...log, created_at: new Date() } }, { upsert: true });
      return;
    }
    mkdirSync(dataDir, { recursive: true });
    const all = existsSync(notificationLogPath) ? JSON.parse(readFileSync(notificationLogPath, "utf8")) as NotificationLog[] : [];
    writeFileSync(notificationLogPath, `${JSON.stringify([log, ...all].slice(0, 1000), null, 2)}\n`, "utf8");
  }

  private mongoUri(): string {
    return String(process.env.MONGODB_URI || "").trim();
  }

  private normalizeStoredUser(user: AppUser): AppUser {
    const roles = normalizeUserRoles([...(user.roles || []), user.role]);
    return { ...user, role: primaryUserRole(roles), roles };
  }

  private async ensureIndexes() {
    if (!this.db) return;
    await Promise.all([
      this.appState().createIndex({ key: 1 }, { unique: true }),
      this.ledgerRecords().createIndex({ record_id: 1 }, { unique: true }),
      this.ledgerRecords().createIndex({ sort_order: 1 }),
      this.ledgerRecords().createIndex({ fields: "text" }),
      this.ledgerLogs().createIndex({ id: 1 }, { unique: true }),
      this.ledgerLogs().createIndex({ record_id: 1, created_at: -1 }),
      this.appUsers().createIndex({ openId: 1 }, { unique: true }),
      this.appUsers().createIndex({ role: 1 }),
      this.appUsers().createIndex({ roles: 1 }),
      this.userFieldPreferences().createIndex({ openId: 1 }, { unique: true }),
      this.importBatches().createIndex({ id: 1 }, { unique: true }),
      this.importBatches().createIndex({ created_at: -1 }),
      this.notificationLogs().createIndex({ id: 1 }, { unique: true }),
      this.notificationLogs().createIndex({ recordId: 1, created_at: -1 })
    ]);
  }

  private async seedIfEmpty() {
    if (!this.db) return;
    const count = await this.ledgerRecords().countDocuments();
    if (count > 0 || !existsSync(dataPath)) return;
    const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as Dataset;
    await this.saveDataset(dataset);
    const logs = existsSync(ledgerLogPath) ? JSON.parse(readFileSync(ledgerLogPath, "utf8")) as LedgerLog[] : [];
    for (const log of logs) await this.appendLog(log);
  }

  private appState(): Collection<AppStateDoc> {
    return this.db!.collection<AppStateDoc>("app_state");
  }

  private ledgerRecords(): Collection<LedgerRecordDoc> {
    return this.db!.collection<LedgerRecordDoc>("ledger_records");
  }

  private ledgerLogs(): Collection<LedgerLogDoc> {
    return this.db!.collection<LedgerLogDoc>("ledger_logs");
  }

  private appUsers(): Collection<AppUserDoc> {
    return this.db!.collection<AppUserDoc>("app_users");
  }

  private userFieldPreferences(): Collection<UserFieldPreferenceDoc> {
    return this.db!.collection<UserFieldPreferenceDoc>("user_field_preferences");
  }

  private importBatches(): Collection<ImportBatchDoc> {
    return this.db!.collection<ImportBatchDoc>("import_batches");
  }

  private notificationLogs(): Collection<NotificationLogDoc> {
    return this.db!.collection<NotificationLogDoc>("notification_logs");
  }
}
