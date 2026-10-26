#!/usr/bin/env node
// Exports every CONFIRMED waitlist signup to a CSV file.
// Usage: npm run export-waitlist
// Needs AWS credentials configured locally (same account where the table lives).
import { writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'eu-central-1';
const TABLE = process.env.WAITLIST_TABLE_NAME || 'Waitlist';
const OUT_FILE = process.env.OUT_FILE || 'waitlist-export.csv';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const rows = [];
  let ExclusiveStartKey;

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: '#s = :confirmed',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':confirmed': 'confirmed' },
        ExclusiveStartKey,
      }),
    );
    rows.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const header = ['email', 'language', 'createdAt', 'confirmedAt', 'source'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((h) => csvEscape(row[h])).join(','));
  }

  writeFileSync(OUT_FILE, lines.join('\n') + '\n', 'utf8');
  console.log(`Exported ${rows.length} confirmed email(s) to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exitCode = 1;
});
