// Main handler export
export { handler } from './index.js';

// Type exports
export * from './types/index.js';

// Configuration exports
export { config } from './config/index.js';

// Utility exports
export * from './utils/response.js';
export * from './utils/validation.js';
export * from './utils/logger.js';

// Handler exports
export { healthHandler } from './handlers/health.js';
export { qaHandler } from './handlers/qa.js';

// Router exports
export { routeRequest, initializeRouter, getRoutes, hasRoute, router } from './router/index.js';
