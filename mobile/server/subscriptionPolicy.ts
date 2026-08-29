export const MAX_PLAN_TRIAL_DAYS = 90;
export const BILLING_PERIOD_DAYS = 30;

export function getServerTrialDuration(planTrialDays: number) {
  if (!Number.isInteger(planTrialDays) || planTrialDays < 0 || planTrialDays > MAX_PLAN_TRIAL_DAYS) {
    throw new Error("Subscription plan trial duration is invalid");
  }
  return planTrialDays;
}
