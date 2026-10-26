import type { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.WAITLIST_TABLE_NAME!;
const SITE_URL = process.env.SITE_URL!;

function redirectTo(location: string) {
  return { statusCode: 302, headers: { location }, body: '' };
}

export const handler: Handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token;
    if (!token) {
      return redirectTo(`${SITE_URL}/?confirmed=0`);
    }

    const found = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'byConfirmToken',
        KeyConditionExpression: 'confirmToken = :t',
        ExpressionAttributeValues: { ':t': token },
        Limit: 1,
      }),
    );

    const item = found.Items?.[0];
    if (!item) {
      return redirectTo(`${SITE_URL}/?confirmed=0`);
    }

    if (item.status !== 'confirmed') {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { email: item.email },
          UpdateExpression: 'SET #s = :confirmed, confirmedAt = :now',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':confirmed': 'confirmed', ':now': new Date().toISOString() },
        }),
      );
    }

    return redirectTo(`${SITE_URL}/?confirmed=1`);
  } catch (err) {
    console.error('confirmWaitlist error', err);
    return redirectTo(`${SITE_URL}/?confirmed=0`);
  }
};
