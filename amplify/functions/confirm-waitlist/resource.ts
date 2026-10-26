import { defineFunction } from '@aws-amplify/backend';

export const confirmWaitlist = defineFunction({
  name: 'confirm-waitlist',
  entry: './handler.ts',
  timeoutSeconds: 10,
});
