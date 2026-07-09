import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

const exporter = new OTLPLogExporter({
  url: "https://us.i.posthog.com/otlp/v1/logs",
  headers: {
    Authorization: "Bearer phc_sv3aBkEY4DE4wejGWfMHfNYxCUpDBxBc6iVRsJu7Q47t",
  },
});

const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    "service.name": "my-app",
  }),
});

loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(exporter));

export const logger = loggerProvider.getLogger("my-app");
