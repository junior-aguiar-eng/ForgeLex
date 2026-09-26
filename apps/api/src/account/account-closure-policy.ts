export const ACCOUNT_CLOSURE_POLICY = Object.freeze({
  version: '2026-09-22.v1',
  confirmation: 'ENCERRAR MINHA CONTA',
  reauthenticationMaxAgeSeconds: 300,
  privateContentDeadlineDays: 7,
  supabaseIdentityDeadlineHours: 24,
  accessLogRetentionDays: 180,
  backupRetentionDays: 35,
});
