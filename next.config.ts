import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-node (the embedding model's runtime) loads libonnxruntime.so.1 at startup, which
  // file tracing can't see, so Vercel shipped the routes without it. Include the Linux binaries
  // for every route that embeds a query.
  outputFileTracingIncludes: {
    "/api/search": ["./node_modules/onnxruntime-node/bin/napi-v*/linux/x64/**/*"],
    "/search": ["./node_modules/onnxruntime-node/bin/napi-v*/linux/x64/**/*"],
  },
};

export default nextConfig;
