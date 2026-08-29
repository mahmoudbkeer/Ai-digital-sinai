export type LedgerSide = "debit" | "credit";

export type LedgerEntry = {
  account: string;
  side: LedgerSide;
  amountMinor: number;
};

export type LedgerTransaction = {
  transactionId: string;
  sourceEventId: string;
  currency: string;
  entries: LedgerEntry[];
};

export function validateLedgerEntries(entries: LedgerEntry[]): { valid: true } | { valid: false; reason: string } {
  if (entries.length < 2) return { valid: false, reason: "A ledger transaction requires at least two entries." };

  const totals = { debit: 0, credit: 0 };
  for (const entry of entries) {
    if (!entry.account.trim()) return { valid: false, reason: "Every ledger entry requires an account." };
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      return { valid: false, reason: "Ledger amounts must be positive integer minor units." };
    }
    totals[entry.side] += entry.amountMinor;
  }

  if (totals.debit !== totals.credit) return { valid: false, reason: "Debit and credit totals must balance." };
  return { valid: true };
}

export function createLedgerTransaction(input: Omit<LedgerTransaction, "entries"> & { entries: LedgerEntry[] }): LedgerTransaction {
  const validation = validateLedgerEntries(input.entries);
  if (!validation.valid) throw new Error(validation.reason);
  if (!input.transactionId.trim() || !input.sourceEventId.trim() || !input.currency.trim()) {
    throw new Error("Ledger transaction identity and currency are required.");
  }
  return { ...input, entries: input.entries.map((entry) => ({ ...entry })) };
}
