import { PostHog } from "posthog-node";

const posthogClient = new PostHog(process.env.POSTHOG_PROJECT_TOKEN, {
  host: process.env.POSTHOG_HOST || "https://us.i.posthog.com", // Updated default host
  enableExceptionAutocapture: true,
});

// Helper to manually flush the event buffer
export const flushPostHog = async () => {
  await posthogClient.flushAsync();
};

export default posthogClient;
