import { Module } from "@nestjs/common";
import { ApiKeyService } from "./api/api-key.service.js";
import { ApiKeyAdminController, PublicApiController } from "./api/public-api.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { LarkOAuthService } from "./auth/lark-oauth.service.js";
import { LedgerStoreService } from "./infra/ledger-store.service.js";
import { QueueService } from "./infra/queue.service.js";
import { LedgerController } from "./ledger/ledger.controller.js";
import { LarkNotificationService } from "./notifications/lark-notification.service.js";
import { DeliveryEfficiencyService } from "./metrics/delivery-efficiency.service.js";
import { SatisfactionService } from "./metrics/satisfaction.service.js";
import { LarkBaseSyncService } from "./sync/lark-base-sync.service.js";

@Module({
  // PublicApiController first: it owns the `api/v1` prefix, and registering it ahead of the
  // browser controller keeps that namespace from colliding with any future `api/:something` route.
  controllers: [PublicApiController, ApiKeyAdminController, LedgerController],
  providers: [
    ApiKeyService,
    AuthService,
    LarkOAuthService,
    LedgerStoreService,
    LarkNotificationService,
    QueueService,
    DeliveryEfficiencyService,
    SatisfactionService,
    LarkBaseSyncService
  ]
})
export class AppModule {}
