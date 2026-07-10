import "./config/env.js";
import { register } from "node:module";
register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

import process from "process";

const { NodeSDK } = await import("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } =
  await import("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } =
  await import("@opentelemetry/exporter-trace-otlp-proto");
const { OTLPLogExporter } =
  await import("@opentelemetry/exporter-logs-otlp-http");
const { BatchLogRecordProcessor } = await import("@opentelemetry/sdk-logs");
const { resourceFromAttributes, defaultResource } =
  await import("@opentelemetry/resources");
const { SEMRESATTRS_SERVICE_NAME } =
  await import("@opentelemetry/semantic-conventions");

// Fallback to default PostHog cloud URL if it isn't specified
const posthogHost = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
const projectToken = process.env.POSTHOG_PROJECT_TOKEN;

if (!projectToken) {
  throw new Error(
    "CRITICAL: POSTHOG_PROJECT_TOKEN is missing from the environment!",
  );
}

// Set up Tracing Exporter
const traceExporter = new OTLPTraceExporter({
  url: `${posthogHost}/api/v2/otel/v1/traces`,
  headers: {
    Authorization: `Bearer ${projectToken}`,
  },
});

// Set up Logging Exporter (Using PostHog's native ingest endpoint)
const logExporter = new OTLPLogExporter({
  url: `${posthogHost}/i/v1/logs`,
  headers: {
    Authorization: `Bearer ${projectToken}`,
  },
});

const customResource = defaultResource().merge(
  resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: "bottoms-up-golf",
  }),
);

const sdk = new NodeSDK({
  resource: customResource,
  traceExporter,
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("Tracing terminated"))
    .catch((error) => console.log("Error terminating tracing", error))
    .finally(() => process.exit(0));
});
