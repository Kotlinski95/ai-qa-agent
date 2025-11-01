import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Route, HttpMethod, RouteHandler } from '../types/index.js';
import { createCorsResponse, createNotFoundResponse } from '../utils/response.js';
import { availableRoutes } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Import handlers
import { healthHandler } from '../handlers/health.js';
import { qaHandler } from '../handlers/qa.js';
import { qaStreamHandler } from '../handlers/qa-stream.js';

/**
 * Application routes registry
 */
let routes: Route[] = [];

/**
 * Initialize all application routes
 */
function initializeRoutes(): void {
  // Health check route
  addRoute(HttpMethod.GET, '/health', healthHandler);
  
  // QA routes
  addRoute(HttpMethod.GET, '/qa/stream', qaStreamHandler);
  addRoute(HttpMethod.POST, '/qa/stream', qaStreamHandler);
  addRoute(HttpMethod.POST, '/qa', qaHandler);
  addRoute(HttpMethod.POST, '/', qaHandler);
  
  logger.debug('Routes initialized', {
    routeCount: routes.length,
    routes: routes.map(r => `${r.method} ${r.path}`),
  });
}

/**
 * Add a route to the router
 */
function addRoute(method: HttpMethod, path: string | RegExp, handler: RouteHandler): void {
  routes.push({ method, path, handler });
}

/**
 * Find a matching route for the given method and path
 */
function findRoute(method: string, path: string): Route | undefined {
  return routes.find(route => {
    // Check if method matches
    if (route.method !== method) {
      return false;
    }

    // Check if path matches
    if (typeof route.path === 'string') {
      return route.path === path;
    } else if (route.path instanceof RegExp) {
      return route.path.test(path);
    }

    return false;
  });
}

/**
 * Route incoming request to appropriate handler
 */
export async function routeRequest(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;
  
  logger.debug('Routing request', { method: httpMethod, path });

  // Handle CORS preflight requests
  if (httpMethod === HttpMethod.OPTIONS) {
    logger.debug('Handling CORS preflight request');
    return createCorsResponse();
  }

  // Find matching route
  const route = findRoute(httpMethod, path);
  
  if (!route) {
    logger.warn('Route not found', { method: httpMethod, path });
    return createNotFoundResponse(httpMethod, path, availableRoutes, context);
  }

  logger.debug('Route matched', { handler: route.handler.name });

  try {
    // Execute route handler
    return await route.handler(event, context);
  } catch (error) {
    logger.error('Route handler error', error);
    
    // Return generic error response for unhandled exceptions
    return createNotFoundResponse(
      httpMethod, 
      path, 
      availableRoutes, 
      context
    );
  }
}

/**
 * Get all registered routes for debugging
 */
export function getRoutes(): Route[] {
  return [...routes];
}

/**
 * Check if a route exists
 */
export function hasRoute(method: string, path: string): boolean {
  return !!findRoute(method, path);
}

/**
 * Initialize the router
 */
export function initializeRouter(): void {
  routes = []; // Reset routes
  initializeRoutes();
}

/**
 * Router object for backward compatibility
 * @deprecated Use individual router functions instead
 */
export const router = {
  route: routeRequest,
  getRoutes,
  hasRoute,
  initialize: initializeRouter,
};
