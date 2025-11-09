import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

export type RouteHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

export interface Route {
  method: string;
  path: string | RegExp;
  handler: RouteHandler;
}
