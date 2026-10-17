import { Global, Module } from "@nestjs/common";
import { config } from "../config";
import { DOCS_ADAPTER, HRIS_ADAPTER, INTEGRATION_OPTIONS, type IntegrationOptions } from "./adapters";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { Mock1CZupAdapter, MockDocumentologAdapter } from "./mock.adapters";

// The one place that decides which 1С / Documentolog implementation runs.
// To go live: implement HrisAdapter/DocsAdapter against the real APIs and bind them here.
if (config.integrationsMode !== "mock") {
  throw new Error(`INTEGRATIONS_MODE=${config.integrationsMode} is not implemented; only "mock" is available`);
}

const options: IntegrationOptions = {
  timeoutMs: config.integrationsTimeoutMs,
  syncTimeoutMs: config.integrationsSyncTimeoutMs,
};

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    { provide: INTEGRATION_OPTIONS, useValue: options },
    { provide: HRIS_ADAPTER, useClass: Mock1CZupAdapter },
    { provide: DOCS_ADAPTER, useClass: MockDocumentologAdapter },
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
