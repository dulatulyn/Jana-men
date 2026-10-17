ALTER TABLE "integration_log" ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "request_id" INTEGER,
ADD COLUMN     "retry_of" INTEGER;

CREATE INDEX "integration_log_request_id_idx" ON "integration_log"("request_id");

ALTER TABLE "integration_log" ADD CONSTRAINT "integration_log_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
