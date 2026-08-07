import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { LedgerRecord } from "../core/types.js";

export interface SnapshotResult {
  target: "oss" | "none";
  key: string;
  bytes: number;
  recordCount: number;
}

/**
 * Captures the ledger before anything destructive touches it.
 *
 * Exists because there is no database backup or snapshot policy on either dev or prod, and this ledger
 * has already lost records once: the sync used to replace the whole collection from a stale snapshot,
 * which silently deleted anything written during the window. That specific bug is fixed, but
 * `saveDataset` is still a `deleteMany({})` + `insertMany(...)`, so one future misuse could empty the
 * table with nothing to restore from.
 *
 * Uploads to Aliyun OSS when configured. Signing is done here rather than through an SDK because the
 * OSS v1 scheme is a single HMAC-SHA1 over a canonical string — pulling in a cloud SDK to send one PUT
 * would add far more surface than it saves.
 *
 * Never throws. A failed backup must not turn into a failed write: the caller is usually in the middle
 * of a legitimate operation, and refusing it because the safety net is unavailable would be worse than
 * proceeding without the net. Failures are logged loudly instead.
 */
@Injectable()
export class SnapshotService {
  private readonly accessKeyId = env("OSS_ACCESS_KEY_ID");
  private readonly accessKeySecret = env("OSS_ACCESS_KEY_SECRET");
  private readonly bucket = env("OSS_BUCKET");
  // e.g. oss-cn-shanghai.aliyuncs.com — region-specific, no scheme, no bucket.
  private readonly endpoint = env("OSS_ENDPOINT").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  private readonly prefix = (env("OSS_PREFIX") || "data-panel/snapshots").replace(/^\/+|\/+$/g, "");

  isConfigured(): boolean {
    return Boolean(this.accessKeyId && this.accessKeySecret && this.bucket && this.endpoint);
  }

  /** Reports configuration state without leaking anything: names and bucket only, never the keys. */
  describe() {
    return {
      configured: this.isConfigured(),
      target: this.isConfigured() ? `oss://${this.bucket}/${this.prefix}` : "",
      endpoint: this.endpoint
    };
  }

  /**
   * Serializes and uploads one snapshot. `reason` lands in the object key so an incident can be traced
   * back to the operation that triggered it.
   */
  async capture(reason: string, records: LedgerRecord[]): Promise<SnapshotResult | null> {
    if (!this.isConfigured()) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeReason = String(reason || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
    const key = `${this.prefix}/${stamp}-${safeReason}-${records.length}.json.gz`;
    try {
      const body = gzipSync(Buffer.from(JSON.stringify({
        capturedAt: new Date().toISOString(),
        reason,
        recordCount: records.length,
        records
      }), "utf8"));
      await this.put(key, body);
      console.log(`Ledger snapshot uploaded: oss://${this.bucket}/${key} (${records.length} records, ${body.length} bytes)`);
      return { target: "oss", key, bytes: body.length, recordCount: records.length };
    } catch (error) {
      console.warn(`Ledger snapshot FAILED for "${reason}" (${records.length} records): ${(error as Error).message}`);
      return null;
    }
  }

  private async put(key: string, body: Buffer): Promise<void> {
    const date = new Date().toUTCString();
    const contentType = "application/gzip";
    // CanonicalizedResource is the bucket-qualified path, which is why the bucket appears here even
    // though it is already in the host.
    const canonicalResource = `/${this.bucket}/${key}`;
    const signature = createHmac("sha1", this.accessKeySecret)
      .update(`PUT\n\n${contentType}\n${date}\n${canonicalResource}`, "utf8")
      .digest("base64");
    const response = await fetch(`https://${this.bucket}.${this.endpoint}/${key}`, {
      method: "PUT",
      headers: {
        Authorization: `OSS ${this.accessKeyId}:${signature}`,
        Date: date,
        "Content-Type": contentType,
        "Content-Length": String(body.length)
      },
      body: new Uint8Array(body)
    });
    if (!response.ok) {
      // OSS returns XML errors; the code element is the useful part and contains no credential.
      const text = await response.text().catch(() => "");
      const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] || "";
      throw new Error(`OSS ${response.status}${code ? ` ${code}` : ""}`);
    }
  }
}

function env(name: string): string {
  return String(process.env[name] || "").trim();
}
