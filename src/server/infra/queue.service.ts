import { Injectable, OnModuleInit } from "@nestjs/common";
import { Redis, type Redis as RedisClient } from "ioredis";

@Injectable()
export class QueueService implements OnModuleInit {
  private redis: RedisClient | null = null;
  private ready = false;

  async onModuleInit() {
    if (!process.env.REDIS_URL) return;
    this.redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true
    });
    try {
      await this.redis?.connect();
      this.ready = true;
      console.log("Queue connected to Redis");
    } catch (error) {
      this.ready = false;
      console.warn(`Redis unavailable, queue disabled: ${(error as Error).message}`);
    }
  }

  async enqueue(eventName: string, payload: Record<string, unknown>) {
    if (!this.ready || !this.redis) return;
    await this.redis.lpush("delivery-pipeline:events", JSON.stringify({
      eventName,
      payload,
      createdAt: new Date().toISOString()
    }));
  }

  isReady(): boolean {
    return this.ready;
  }
}
