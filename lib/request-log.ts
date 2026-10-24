import type { Span } from "@opentelemetry/api";
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { log } from "@/lib/log";

// Next.js wraps every incoming request in one "BaseServer.handleRequest" span: it starts when the
// request arrives and ends after the handler sets the status. Logging at those two points gives
// request_start / request_done for every route without touching any handler.
// In dev and on some hosts Next.js nests a second handleRequest span (the render) inside the
// first (the router); only the outermost one is logged. A remote parent (an incoming
// traceparent header) still counts as outermost.
const isRequestSpan = (span: ReadableSpan) =>
  span.attributes["next.span_type"] === "BaseServer.handleRequest" &&
  (!span.parentSpanContext || span.parentSpanContext.isRemote === true);

// Path only: query strings can carry tokens or emails.
const pathOf = (target: unknown) => String(target ?? "").split("?")[0];

export const requestLogger: SpanProcessor = {
  onStart(span: Span) {
    const readable = span as unknown as ReadableSpan;
    if (!isRequestSpan(readable)) return;
    const attrs = readable.attributes;
    log.info("request_start", { route: pathOf(attrs["http.target"]), method: attrs["http.method"] });
  },
  onEnd(span: ReadableSpan) {
    if (!isRequestSpan(span)) return;
    const attrs = span.attributes;
    const [s, ns] = span.duration;
    log.info("request_done", {
      // The route pattern (e.g. /api/cards/[id]) groups requests for latency numbers; fall back to the path.
      route: attrs["next.route"] ?? pathOf(attrs["http.target"]),
      method: attrs["http.method"],
      status: attrs["http.status_code"],
      ms: Math.round(s * 1e3 + ns / 1e6),
    });
  },
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};
