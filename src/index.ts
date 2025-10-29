import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));

  try {
    // TODO: Implement your AI QA agent logic here
    
    const response: APIGatewayProxyResult = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Configure CORS as needed
      },
      body: JSON.stringify({
        message: 'Hello from TypeScript Lambda!',
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId,
      }),
    };

    return response;
  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
