import "../config/env.js";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import process from "process";

const token = process.env.POSTHOG_PROJECT_TOKEN;
if (!token || token.trim() === "" || token.includes("your_actual_token")) {
  console.error(
    "❌ TELEMETRY INITIALIZATION ABORTED: Valid POSTHOG_PROJECT_TOKEN was not detected in process.env!",
  );
}

const { BatchLogRecordProcessor } = await import("@opentelemetry/sdk-logs");

const posthogExporter = new OTLPLogExporter({
  url: "https://us.i.posthog.com/i/v1/logs",
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// FIX 1: Pass tuning parameters to force immediate network streaming
const logProcessor = new BatchLogRecordProcessor(posthogExporter, {
  maxQueueSize: 100, // Maximum logs kept in memory
  scheduledDelayMillis: 500, // Flush logs to PostHog every 500ms (Default is 5000ms!)
  maxExportBatchSize: 1, // Flush as soon as 1 log is ready
});

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "bottoms-up-golf",
  }),
  logRecordProcessor: logProcessor,
  logRecordProcessors: [logProcessor],
});

try {
  sdk.start();
  console.log(
    "🚀 [OTEL SUCCESS]: OpenTelemetry log infrastructure fully mounted.",
  );
} catch (error) {
  console.error(
    "❌ [OTEL CRITICAL ERROR]: Engine core failed initialization runtime checks:",
    error,
  );
}

export const appLogger = logs.getLogger("my-app");

// FIX 2: Force an immediate, repetitive test stream to bypass the Express lifecycle
let testCounter = 1;
const testInterval = setInterval(() => {
  if (testCounter > 5) {
    clearInterval(testInterval);
    return;
  }
  console.log(`📡 Sending test packet #${testCounter} directly to PostHog...`);
  appLogger.emit({
    severityText: "INFO",
    body: `Direct pipeline verification test entry #${testCounter}`,
    attributes: {
      "test.origin": "otel-utility-bootloader",
      "test.instance": testCounter,
    },
  });
  testCounter++;
}, 1000);
