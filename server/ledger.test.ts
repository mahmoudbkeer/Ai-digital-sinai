import { describe, expect, it } from "vitest";
import { createLedgerTransaction, validateLedgerEntries } from "./ledger";

describe("ledger invariants", () => {
  it("accepts a balanced double-entry transaction in minor units", () => {
    const transaction = createLedgerTransaction({
      transactionId: "txn_1",
      sourceEventId: "evt_1",
      currency: "EGP",
      entries: [
        { account: "cash", side: "debit", amountMinor: 12500 },
        { account: "revenue", side: "credit", amountMinor: 12500 },
      ],
    });
    expect(transaction.entries).toHaveLength(2);
  });

  it("rejects unbalanced, fractional, and single-entry postings", () => {
    expect(validateLedgerEntries([{ account: "cash", side: "debit", amountMinor: 10 }]).valid).toBe(false);
    expect(validateLedgerEntries([
      { account: "cash", side: "debit", amountMinor: 10 },
      { account: "revenue", side: "credit", amountMinor: 9 },
    ]).valid).toBe(false);
    expect(validateLedgerEntries([
      { account: "cash", side: "debit", amountMinor: 10.5 },
      { account: "revenue", side: "credit", amountMinor: 10.5 },
    ]).valid).toBe(false);
  });
});
