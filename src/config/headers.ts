export const headers = {
  cors: {
    'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': process.env.CORS_ALLOW_METHODS || 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': process.env.CORS_ALLOW_HEADERS || 'Content-Type, Authorization',
  },
  common: {
    'Content-Type': 'application/json',
  },
  sse: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  },
  caching: {
    noCache: {
      'Cache-Control': 'no-cache',
    },
    longCache: {
      'Cache-Control': 'public, max-age=3600',
    },
  },
} as const;
export const getHeaders = () => ({
  ...headers.common,
  ...headers.cors,
});
export const getSSEHeaders = () => ({
  ...headers.sse,
  ...headers.cors,
});
export const getOptionsHeaders = () => ({
  ...headers.cors,
});
export const getCorsHeaders = getHeaders;
export const getAPIHeaders = getHeaders;
export const getErrorHeaders = getHeaders;
