import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Redis, type Redis as RedisClient } from "ioredis";
import type { QueueEvent } from "../core/types.js";
import { LarkNotificationService } from "../notifications/lark-notification.service.js";

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private producer: RedisClient | null = null;
  private consumer: RedisClient | null = null;
  private ready = false;
  private running = false;
  private readonly queueName = "delivery-pipeline:events";
  private readonly processingName = "delivery-pipeline:events:processing";
  private readonly deadLetterName = "delivery-pipeline:events:dead";

  constructor(private readonly notifications: LarkNotificationService) {}

  async onModuleInit() {
    if (!process.env.REDIS_URL) return;
    this.producer = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true
    });
    this.consumer = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true
    });
    try {
      await Promise.all([this.producer.connect(), this.consumer.connect()]);
      this.ready = true;
      this.running = true;
      await this.restoreInterruptedEvents();
      void this.consumeLoop();
      console.log("Queue connected to Redis");
    } catch (error) {
      this.ready = false;
      console.warn(`Redis unavailable, queue disabled: ${(error as Error).message}`);
    }
  }

  async enqueue(eventName: string, payload: Record<string, unknown>) {
    if (!this.ready || !this.producer) return;
    const event: QueueEvent = {
      id: randomUUID(),
      eventName,
      payload,
      attempts: 0,
      createdAt: new Date().toISOString()
    };
    await this.producer.lpush(this.queueName, JSON.stringify(event));
  }

  isReady(): boolean {
    return this.ready;
  }

  async onModuleDestroy() {
    this.running = false;
    this.ready = false;
    await Promise.allSettled([
      this.producer?.quit(),
      this.consumer?.quit()
    ]);
  }

  private async consumeLoop() {
    while (this.running && this.consumer && this.producer) {
      try {
        const raw = await this.consumer.brpoplpush(this.queueName, this.processingName, 1);
        if (!raw) continue;
        await this.processRawEvent(raw);
      } catch (error) {
        if (this.running) console.warn(`Queue consumer error: ${(error as Error).message}`);
      }
    }
  }

  private async processRawEvent(raw: string) {
    if (!this.producer) return;
    let event: QueueEvent | null = null;
    try {
      event = JSON.parse(raw) as QueueEvent;
      event.attempts = Number(event.attempts || 0) + 1;
      if (!event.id || !event.eventName) throw new Error("队列事件格式无效");
      await this.notifications.process(event);
      await this.producer.lrem(this.processingName, 1, raw);
    } catch (error) {
      await this.producer.lrem(this.processingName, 1, raw);
      if (!event) {
        await this.producer.lpush(this.deadLetterName, raw);
        return;
      }
      const serialized = JSON.stringify(event);
      if (event.attempts < 3) await this.producer.lpush(this.queueName, serialized);
      else await this.producer.lpush(this.deadLetterName, serialized);
      console.warn(`Queue event ${event.id || "unknown"} failed: ${(error as Error).message}`);
    }
  }

  private async restoreInterruptedEvents() {
    if (!this.producer) return;
    while (true) {
      const raw = await this.producer.rpoplpush(this.processingName, this.queueName);
      if (!raw) break;
    }
  }
}
