import { Module } from "@nestjs/common";
import { AuthService } from "./auth/auth.service.js";
import { LarkOAuthService } from "./auth/lark-oauth.service.js";
import { LedgerStoreService } from "./infra/ledger-store.service.js";
import { QueueService } from "./infra/queue.service.js";
import { LedgerController } from "./ledger/ledger.controller.js";
import { LarkNotificationService } from "./notifications/lark-notification.service.js";
import { SatisfactionService } from "./metrics/satisfaction.service.js";
import { LarkBaseSyncService } from "./sync/lark-base-sync.service.js";

@Module({
  controllers: [LedgerController],
  providers: [
    AuthService,
    LarkOAuthService,
    LedgerStoreService,
    LarkNotificationService,
    QueueService,
    SatisfactionService,
    LarkBaseSyncService
  ]
})
export class AppModule {}
