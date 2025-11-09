import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { Route, RouteHandler } from '@/types/index';
import { HttpMethod } from '@/types/index';
import { createCorsResponse, createNotFoundResponse } from '@utils/response';
import { availableRoutes } from '@config/index';
import { logger } from '@utils/logger';
import { healthHandler } from '@handlers/health';
import { qaHandler } from '@handlers/qa';
import { qaStreamHandler } from '@handlers/qa-stream';
import {
  agentChatHandler,
  agentStreamHandler,
  agentHistoryHandler,
  agentSessionClearHandler,
} from '@handlers/agent';

let routes: Route[] = [];

function initializeRoutes(): void {
  addRoute(HttpMethod.GET, '/health', healthHandler);
  addRoute(HttpMethod.GET, '/qa/stream', qaStreamHandler);
  addRoute(HttpMethod.POST, '/qa/stream', qaStreamHandler);
  addRoute(HttpMethod.POST, '/qa', qaHandler);
  addRoute(HttpMethod.POST, '/', qaHandler);
  addRoute(HttpMethod.POST, '/agent/chat', agentChatHandler);
  addRoute(HttpMethod.POST, '/agent/stream', agentStreamHandler);
  addRoute(HttpMethod.GET, '/agent/stream', agentStreamHandler);
  addRoute(HttpMethod.GET, '/agent/history', agentHistoryHandler);
  addRoute(HttpMethod.DELETE, /^\/agent\/session\/(.+)$/, agentSessionClearHandler);
  logger.debug('Routes initialized', {
    routeCount: routes.length,
    routes: routes.map(r => `${r.method} ${r.path}`),
  });
}

function addRoute(method: HttpMethod, path: string | RegExp, handler: RouteHandler): void {
  routes.push({ method, path, handler });
}

function findRoute(method: string, path: string): Route | undefined {
  return routes.find(route => {
    if (route.method !== method) {
      return false;
    }
    if (typeof route.path === 'string') {
      return route.path === path;
    } else if (route.path instanceof RegExp) {
      return route.path.test(path);
    }
    return false;
  });
}

export async function routeRequest(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const eventWithExtras = event as APIGatewayProxyEvent & {
    requestContext?: {
      http?: {
        method?: string;
        path?: string;
      };
    };
    rawPath?: string;
    version?: string;
  };
  const httpMethod = event.httpMethod || eventWithExtras.requestContext?.http?.method || 'GET';
  const path =
    event.path || eventWithExtras.requestContext?.http?.path || eventWithExtras.rawPath || '/';
  logger.debug('Routing request', {
    method: httpMethod,
    path,
    eventType: eventWithExtras.version || 'v1',
  });
  if (httpMethod === HttpMethod.OPTIONS) {
    logger.debug('Handling CORS preflight request');
    return createCorsResponse();
  }
  const route = findRoute(httpMethod, path);
  if (!route) {
    logger.warn('Route not found', { method: httpMethod, path });
    return createNotFoundResponse(httpMethod, path, availableRoutes, context);
  }
  logger.debug('Route matched', { handler: route.handler.name });
  try {
    return await route.handler(event, context);
  } catch (error) {
    logger.error('Route handler error', error);
    return createNotFoundResponse(httpMethod, path, availableRoutes, context);
  }
}

export function getRoutes(): Route[] {
  return [...routes];
}

export function hasRoute(method: string, path: string): boolean {
  return !!findRoute(method, path);
}

export function initializeRouter(): void {
  routes = [];
  initializeRoutes();
}

export const router = {
  route: routeRequest,
  getRoutes,
  hasRoute,
  initialize: initializeRouter,
};
