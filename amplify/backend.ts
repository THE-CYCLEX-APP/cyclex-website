import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { joinWaitlist } from './functions/join-waitlist/resource';
import { confirmWaitlist } from './functions/confirm-waitlist/resource';

const backend = defineBackend({
  joinWaitlist,
  confirmWaitlist,
});

// ---------------------------------------------------------------------------
// Allowed origins for CORS: your domain + the Amplify-generated URL.
// IMPORTANT: after your first deploy, Amplify will give you a URL like
// https://main.d1a2b3c4d5e6f.amplifyapp.com — add it below and redeploy.
// See the step-by-step instructions for exactly where to find it.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'https://thecyclexapp.com',
  'https://www.thecyclexapp.com',
  'https://main.d1m9dsh321wa9i.amplifyapp.com',
];

const SITE_URL = 'https://thecyclexapp.com';
const SES_FROM_ADDRESS = 'hello@thecyclexapp.com';

const waitlistStack = backend.createStack('CyclexWaitlistStack');

// ---------------------------------------------------------------------------
// DynamoDB: Waitlist table
// ---------------------------------------------------------------------------
const waitlistTable = new Table(waitlistStack, 'WaitlistTable', {
  tableName: 'Waitlist',
  partitionKey: { name: 'email', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
  pointInTimeRecovery: true,
});

// Lets confirmWaitlist look up a signup by the token in the email link,
// without exposing or guessing emails.
waitlistTable.addGlobalSecondaryIndex({
  indexName: 'byConfirmToken',
  partitionKey: { name: 'confirmToken', type: AttributeType.STRING },
  projectionType: ProjectionType.ALL,
});

// ---------------------------------------------------------------------------
// DynamoDB: per-IP rate limit store (5 requests / IP / hour), TTL-expired.
// Kept separate from Waitlist so that table's schema stays exactly as spec'd.
// ---------------------------------------------------------------------------
const rateLimitTable = new Table(waitlistStack, 'WaitlistRateLimitTable', {
  tableName: 'WaitlistRateLimit',
  partitionKey: { name: 'ipHourKey', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',
  removalPolicy: RemovalPolicy.DESTROY,
});

// ---------------------------------------------------------------------------
// Least-privilege IAM: each function gets only the DynamoDB actions it needs.
// ---------------------------------------------------------------------------
const joinFn = backend.joinWaitlist.resources.lambda;
const confirmFn = backend.confirmWaitlist.resources.lambda;

waitlistTable.grant(joinFn, 'dynamodb:GetItem', 'dynamodb:PutItem');
rateLimitTable.grant(joinFn, 'dynamodb:UpdateItem');
waitlistTable.grant(confirmFn, 'dynamodb:Query', 'dynamodb:UpdateItem');

const region = Stack.of(waitlistStack).region;
const account = Stack.of(waitlistStack).account;

// SES: only allowed to send from the one verified identity, nothing else.
joinFn.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: [`arn:aws:ses:${region}:${account}:identity/thecyclexapp.com`],
  }),
);

// ---------------------------------------------------------------------------
// Function URLs (public HTTP endpoints), CORS locked to our own domain(s).
// ---------------------------------------------------------------------------
const confirmUrl = confirmFn.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ALLOWED_ORIGINS,
    allowedMethods: [HttpMethod.GET],
  },
});

const joinUrl = joinFn.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ALLOWED_ORIGINS,
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ['content-type'],
    maxAge: Duration.minutes(5),
  },
});

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
backend.joinWaitlist.addEnvironment('WAITLIST_TABLE_NAME', waitlistTable.tableName);
backend.joinWaitlist.addEnvironment('RATE_LIMIT_TABLE_NAME', rateLimitTable.tableName);
backend.joinWaitlist.addEnvironment('SES_FROM_ADDRESS', SES_FROM_ADDRESS);
backend.joinWaitlist.addEnvironment('CONFIRM_BASE_URL', confirmUrl.url);

backend.confirmWaitlist.addEnvironment('WAITLIST_TABLE_NAME', waitlistTable.tableName);
backend.confirmWaitlist.addEnvironment('SITE_URL', SITE_URL);

backend.addOutput({
  custom: {
    joinWaitlistUrl: joinUrl.url,
    confirmWaitlistUrl: confirmUrl.url,
  },
});
