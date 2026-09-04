// Amounts are stored in cents everywhere; this is the only place they turn
// into something a user reads.
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
