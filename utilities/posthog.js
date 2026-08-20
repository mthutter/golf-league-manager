import { PostHog } from "posthog-node";
import logger from "./logger.js"; // Adjust this path to point exactly to your Pino logger utility

const posthogClient = new PostHog(process.env.POSTHOG_PROJECT_TOKEN, {
  host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
  enableExceptionAutocapture: true,
  debug: false,
});

/* ========================================================================= 
   💡 PROXY INTERCEPTOR: Automatic Pino Logging for Every Event
   ========================================================================= */
// 1. Capture and bind a safe reference to the native SDK capture pipeline
const nativeCapture = posthogClient.capture.bind(posthogClient);

// 2. Override the method instance with a custom execution shell wrapper
posthogClient.capture = function (options) {
  try {
    // Isolate variables cleanly with fallback defaults to ensure zero application crashes
    const eventName = options?.event || "unknown_event";
    const distinctId = options?.distinctId || "anonymous";
    const customProps = options?.properties || {};

    // 💡 EXTRACT MEMBER NAME: Pulls from payload properties or falls back to an anonymous string
    const memberName = customProps.member_name || customProps.$set?.name || "Guest/Anonymous";

    // Stream a structured payload tracking entry straight to your Pino local console
    logger.info(
      {
        telemetry: "posthog",
        event: eventName,
        distinctId,
        member_name: memberName, // 👈 Added explicitly as a root filter field
        ...customProps,
      },
      `PostHog Analytics Dispatch: [${eventName}] fired for Player [${memberName}] (${distinctId})`,
    );
  } catch (logError) {
    // Safe check ensures a logging parsing failure never corrupts the actual analytics pipeline
    logger.error({ err: logError.message }, "Telemetry logging proxy exception caught");
  }

  // 3. Deliver the unchanged data payload parameters smoothly back into the core PostHog engine
  return nativeCapture(options);
};

// Helper to manually flush the event buffer
export const flushPostHog = async () => {
  await posthogClient.flushAsync();
};

export default posthogClient;
