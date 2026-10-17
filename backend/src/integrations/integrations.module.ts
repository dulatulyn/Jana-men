import { Global, Module } from "@nestjs/common";
import { config } from "../config";
import { DOCS_ADAPTER, HRIS_ADAPTER } from "./adapters";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { Mock1CZupAdapter, MockDocumentologAdapter } from "./mock.adapters";

// The one place that decides which 1С / Documentolog implementation runs.
// To go live: implement HrisAdapter/DocsAdapter against the real APIs and bind them here.
if (config.integrationsMode !== "mock") {
  throw new Error(`INTEGRATIONS_MODE=${config.integrationsMode} is not implemented; only "mock" is available`);
}

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    { provide: HRIS_ADAPTER, useClass: Mock1CZupAdapter },
    { provide: DOCS_ADAPTER, useClass: MockDocumentologAdapter },
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
