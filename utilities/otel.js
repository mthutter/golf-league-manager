// ./utilities/otel.js
import "../config/env.js";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import process from "process";
import { trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";

const token = process.env.POSTHOG_PROJECT_TOKEN;

// Note: Use 'https://eu.i.posthog.com/...' if your data residency is set to Europe.
const LOGS_ENDPOINT = `https://posthog.com{token}`;
const TRACES_ENDPOINT = `https://posthog.com`;

// 1. TELEMETRY LOG EXPORTER
const { BatchLogRecordProcessor } = await import("@opentelemetry/sdk-logs");
const posthogLogExporter = new OTLPLogExporter({
  url: LOGS_ENDPOINT,
});

// 2. TELEMETRY TRACE EXPORTER
const posthogTraceExporter = new OTLPTraceExporter({
  url: TRACES_ENDPOINT,
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// 3. MOUNT OPEN-TELEMETRY ENGINE
export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "bottoms-up-golf",
  }),
  logRecordProcessor: new BatchLogRecordProcessor(posthogLogExporter),
  spanProcessors: [new BatchSpanProcessor(posthogTraceExporter)],
  instrumentations: [getNodeAutoInstrumentations()], // Auto-instruments Express, HTTP, SQLite
});

sdk.start();

// 4. EXPORT UTILITIES USING SEPARATE PACKAGE INTERFACES
export const appLogger = logs.getLogger("my-app");
export const appTracer = trace.getTracer("my-app");
