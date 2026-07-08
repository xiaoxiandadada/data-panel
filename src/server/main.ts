import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import express from "express";
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

  app.use(json({ limit: "25mb" }));
  app.use(urlencoded({ extended: true, limit: "25mb" }));
  app.use(express.static(clientRoot, {
    fallthrough: true,
    index: "index.html"
  }));

  await app.listen(port, host);
  console.log(`Delivery pipeline API running at http://${host}:${port}`);
}

await bootstrap();
