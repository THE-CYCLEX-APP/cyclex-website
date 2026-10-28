import { defineFunction } from '@aws-amplify/backend';

export const sendWelcomeBatch = defineFunction({
  name: 'send-welcome-batch',
  entry: './handler.ts',
  timeoutSeconds: 300,
});
