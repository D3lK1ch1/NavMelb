/**
 * Kleisli bind for Promise<T | null>.
 * Sequences nullable async computations — if the input is null, short-circuits.
 *
 * This makes the Kleisli category structure for the Maybe-Promise monad explicit.
 * The NavMelb backend uses Promise<T | null> pervasively for fallible async
 * lookups (geocoding, stop resolution, route finding). This helper names the
 * bind operation used informally throughout.
 *
 * Laws (for reference; tests in __tests__/categorical/):
 *   Left identity:  bindNullable(a, f)        ≡ f(a)           when a ≠ null
 *   Right identity: bindNullable(x, a => a)   ≡ x
 *   Associativity:  bindNullable(bindNullable(x, f), g)
 *                   ≡ bindNullable(x, a => bindNullable(f(a), g))
 */
export async function bindNullable<A, B>(
  ma: A | null,
  f: (a: A) => Promise<B | null>
): Promise<B | null> {
  if (ma === null) return null;
  return f(ma);
}
