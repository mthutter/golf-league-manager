import { logs } from "@opentelemetry/api-logs";
// 1. Import your dependencies normally from the SDK package
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";

// 2. Establish the base connection to PostHog's OTel endpoint
const exporter = new OTLPLogExporter({
  url: "https://us.i.posthog.com", // Use https://posthog.com for EU region
  headers: {
    Authorization: `Bearer ${process.env.POSTHOG_PROJECT_TOKEN}`,
  },
});

// 3. FIX: Pass the processor inside the options object instead of calling .addLogRecordProcessor()
export const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(exporter)],
});

// 4. Set it globally so the API layer routes records through it
logs.setGlobalLoggerProvider(loggerProvider);

// 5. Export the functional logger object for the rest of your app to use
export const appLogger = logs.getLogger("my-app");
