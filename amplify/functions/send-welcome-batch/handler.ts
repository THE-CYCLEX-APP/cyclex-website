import type { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { isLang, renderWelcomeEmailHtml, renderWelcomeEmailText, welcomeEmailSubject } from '../shared/welcome-email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

const TABLE = process.env.WAITLIST_TABLE_NAME!;
const FROM = process.env.SES_FROM_ADDRESS!;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run this from the Lambda console's "Test" button (any event, e.g. {}).
// It emails everyone with status "confirmed" who hasn't gotten the welcome
// email yet, so it's safe to re-run: already-sent people are skipped.
export const handler: Handler = async () => {
  let sent = 0;
  let failed = 0;
  const failedEmails: string[] = [];
  let scanned = 0;

  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: '#s = :confirmed AND attribute_not_exists(welcomeEmailSentAt)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':confirmed': 'confirmed' },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of page.Items ?? []) {
      scanned++;
      const email = String(item.email);
      const lang = isLang(item.language) ? item.language : 'en';

      try {
        await ses.send(
          new SendEmailCommand({
            Source: FROM,
            Destination: { ToAddresses: [email] },
            Message: {
              Subject: { Data: welcomeEmailSubject(lang), Charset: 'UTF-8' },
              Body: {
                Html: { Data: renderWelcomeEmailHtml(lang), Charset: 'UTF-8' },
                Text: { Data: renderWelcomeEmailText(lang), Charset: 'UTF-8' },
              },
            },
          }),
        );

        await ddb.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { email },
            UpdateExpression: 'SET welcomeEmailSentAt = :now',
            ExpressionAttributeValues: { ':now': new Date().toISOString() },
          }),
        );

        sent++;
      } catch (err: any) {
        if (err?.name === 'Throttling' || err?.name === 'TooManyRequestsException') {
          // Back off once and retry this single email before giving up on it.
          await sleep(2000);
          try {
            await ses.send(
              new SendEmailCommand({
                Source: FROM,
                Destination: { ToAddresses: [email] },
                Message: {
                  Subject: { Data: welcomeEmailSubject(lang), Charset: 'UTF-8' },
                  Body: {
                    Html: { Data: renderWelcomeEmailHtml(lang), Charset: 'UTF-8' },
                    Text: { Data: renderWelcomeEmailText(lang), Charset: 'UTF-8' },
                  },
                },
              }),
            );
            await ddb.send(
              new UpdateCommand({
                TableName: TABLE,
                Key: { email },
                UpdateExpression: 'SET welcomeEmailSentAt = :now',
                ExpressionAttributeValues: { ':now': new Date().toISOString() },
              }),
            );
            sent++;
            continue;
          } catch (retryErr) {
            console.error('send-welcome-batch retry failed', email, retryErr);
          }
        } else {
          console.error('send-welcome-batch failed', email, err);
        }
        failed++;
        failedEmails.push(email);
      }

      // Stay comfortably under SES's per-second send rate, especially right
      // after exiting the sandbox when that rate is still low.
      await sleep(350);
    }

    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const summary = { scanned, sent, failed, failedEmails };
  console.log('send-welcome-batch summary', summary);
  return summary;
};
