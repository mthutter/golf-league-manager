import "../config/env.js";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import process from "process";

// FIX 1: Pull tracing natively from core api
import { trace, SpanStatusCode } from "@opentelemetry/api";

// FIX 2: Pull logging natively from its independent api-logs architecture
import { logs } from "@opentelemetry/api-logs";

const token = process.env.POSTHOG_PROJECT_TOKEN;

// 1. TELEMETRY LOG EXPORTER
const { BatchLogRecordProcessor } = await import("@opentelemetry/sdk-logs");
const posthogLogExporter = new OTLPLogExporter({
  url: "https://posthog.com",
  headers: { Authorization: `Bearer ${token}` },
});

// 2. TELEMETRY TRACE EXPORTER (Note: /i/v1/traces matches PostHog specs)
const posthogTraceExporter = new OTLPTraceExporter({
  url: "https://posthog.com",
  headers: { Authorization: `Bearer ${token}` },
});

// 3. MOUNT OPEN-TELEMETRY ENGINE
export const sdk = new NodeSDK({
  resource: resourceFromAttributes({ "service.name": "bottoms-up-golf" }),
  logRecordProcessor: new BatchLogRecordProcessor(posthogLogExporter),
  spanProcessors: [new BatchSpanProcessor(posthogTraceExporter)],
  instrumentations: [getNodeAutoInstrumentations()], // Auto-instruments Express, HTTP, SQLite
});

sdk.start();

// 4. EXPORT UTILITIES USING SEPARATE PACKAGE INTERFACES
export const appLogger = logs.getLogger("my-app");
export const appTracer = trace.getTracer("my-app");

// Keep your looping bootloader test active to verify the network connection below...
