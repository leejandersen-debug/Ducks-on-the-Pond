import type { Instrumentation } from "next";

// Runs once per server instance, before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { context, trace } = await import("@opentelemetry/api");
  const { AsyncLocalStorageContextManager } = await import("@opentelemetry/context-async-hooks");
  const { BasicTracerProvider } = await import("@opentelemetry/sdk-trace-base");
  const { requestLogger } = await import("@/lib/request-log");
  // Lets a span find its parent across awaits, so nested spans and next.route work.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [requestLogger] }));
}

// Called when a route handler, page, server action or proxy throws.
// Logs the message only: the request (headers, cookies) is never passed to the logger.
export const onRequestError: Instrumentation.onRequestError = async (err, _request, context) => {
  const { log } = await import("@/lib/log");
  log.error("request_failed", {
    route: context.routePath,
    message: err instanceof Error ? err.message : String(err),
  });
};
