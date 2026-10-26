import { defineFunction } from '@aws-amplify/backend';

export const joinWaitlist = defineFunction({
  name: 'join-waitlist',
  entry: './handler.ts',
  timeoutSeconds: 15,
});
