import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { SimpleLogRecordProcessor, ConsoleLogRecordExporter } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { logs } from "@opentelemetry/api-logs";

// 1. Configure the explicit full endpoint destination bypassing OTel's URL truncations
const posthogExporter = new OTLPLogExporter({
  // CRITICAL FIX: By providing the absolute deep path matching your region,
  // we force the OTel package to bypass standard truncation rules.
  url: "https://us.i.posthog.com/i/v1/logs", // For EU instances, use: https://eu.i.posthog.com/i/v1/logs
  headers: {
    Authorization: `Bearer ${process.env.POSTHOG_PROJECT_TOKEN}`,
  },
});

// 2. Initialize the global OpenTelemetry SDK Engine
export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "bottoms-up-golf",
  }),
  logRecordProcessors: [
    // Destination B: Local terminal stream visibility
    new SimpleLogRecordProcessor(posthogExporter),
    new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
  ],
});

// 3. Start the telemetry pipeline instantly
try {
  sdk.start();
  console.log("=== OpenTelemetry Engine Fully Active ===");
} catch (error) {
  console.error("Failed to start OTel SDK:", error);
}

// 4. Export the functional logger namespace
export const appLogger = logs.getLogger("my-app");
