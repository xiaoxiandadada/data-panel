import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import express from "express";
import compression from "compression";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppModule } from "./app.module.js";

const clientRoot = resolve(fileURLToPath(new URL("../client/", import.meta.url)));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error"]
  });

  /**
   * Compression, before every other handler so it covers both the API and the static bundle.
   *
   * Nothing was compressed: the administrator dataset is 17.7 MB of JSON for 6020 records × 133
   * columns, and it gzips to 0.32 MB — 55× smaller. Highly repetitive JSON with the same 133 keys
   * repeated on every record is close to the best case for gzip. On a local network the difference is
   * invisible, which is why this went unnoticed; over a real connection it is the difference between a
   * page that loads and a page that appears broken. The 216 KB JS bundle was going out uncompressed too.
   *
   * `threshold` keeps tiny responses (the 3-second version poll is ~30 bytes) from paying for a
   * compression pass that would make them larger.
   */
  app.use(compression({ threshold: 1024 }));
  app.use(json({ limit: "25mb" }));
  app.use(urlencoded({ extended: true, limit: "25mb" }));
  app.use(express.static(clientRoot, {
    fallthrough: true,
    index: "index.html",
    setHeaders(response, filePath) {
      if (filePath.endsWith("index.html")) {
        response.setHeader("Cache-Control", "no-store");
      }
    }
  }));

  await app.listen(port, host);
  console.log(`Delivery pipeline API running at http://${host}:${port}`);
}

await bootstrap();
