/**
 * Law tests for bindNullable (utils/kleisli.ts).
 *
 * bindNullable implements the Kleisli bind for the Maybe-Promise monad.
 * Monad laws (in terms of bindNullable):
 *
 *   Left identity:   bindNullable(a, f)            ≡ f(a)          (when a ≠ null)
 *   Right identity:  bindNullable(x, async a => a) ≡ Promise<x>
 *   Associativity:   bindNullable(bindNullable(x,f),g)
 *                    ≡ bindNullable(x, a => bindNullable(f(a),g))
 *
 * Note: because the monad here is Promise<T|null>, equality is checked
 * on the resolved value, not reference equality.
 */
import { describe, it, expect } from "vitest";
import { bindNullable } from "../../utils/kleisli";

// Test Kleisli arrows (A -> Promise<B | null>)
const double = async (n: number): Promise<number | null> => n * 2;
const inc = async (n: number): Promise<number | null> => n + 1;
const failIfZero = async (n: number): Promise<number | null> =>
  n === 0 ? null : n;
const alwaysNull = async (_: number): Promise<number | null> => null;

describe("bindNullable — monad laws", () => {
  describe("null short-circuit", () => {
    it("returns null when input is null", async () => {
      expect(await bindNullable(null, double)).toBe(null);
    });

    it("returns null when f returns null", async () => {
      expect(await bindNullable(5, alwaysNull)).toBe(null);
    });

    it("propagates null through a chain", async () => {
      const step1 = await bindNullable(0, failIfZero);     // null
      const step2 = await bindNullable(step1, double);      // null (short-circuit)
      expect(step2).toBe(null);
    });
  });

  describe("left identity: bindNullable(a, f) ≡ f(a) when a ≠ null", () => {
    const testValues = [1, 5, 42, 100];
    for (const a of testValues) {
      it(`left identity for a = ${a}`, async () => {
        const bound = await bindNullable(a, double);
        const direct = await double(a);
        expect(bound).toBe(direct);
      });
    }
  });

  describe("right identity: bindNullable(x, async a => a) ≡ x", () => {
    const testValues: Array<number | null> = [1, 5, 42, null];
    for (const x of testValues) {
      it(`right identity for x = ${x}`, async () => {
        const result = await bindNullable(x, async (a) => a);
        expect(result).toBe(x);
      });
    }
  });

  describe("associativity: bind(bind(x,f),g) ≡ bind(x, a => bind(f(a),g))", () => {
    const inputs: Array<number | null> = [3, 7, 0, null];
    for (const x of inputs) {
      it(`associativity for x = ${x}`, async () => {
        // Left-associated
        const left = await bindNullable(
          await bindNullable(x, failIfZero),
          double
        );
        // Right-associated
        const right = await bindNullable(x, async (a) =>
          bindNullable(await failIfZero(a), double)
        );
        expect(left).toBe(right);
      });
    }

    it("associativity with three arrows", async () => {
      // bind(bind(bind(x,f),g),h) ≡ bind(x, a => bind(f(a), b => bind(g(b),h)))
      const x = 3;
      const leftAssoc = await bindNullable(
        await bindNullable(await bindNullable(x, failIfZero), double),
        inc
      );
      const rightAssoc = await bindNullable(x, async (a) =>
        bindNullable(await bindNullable(await failIfZero(a), double), inc)
      );
      expect(leftAssoc).toBe(rightAssoc);
      expect(leftAssoc).toBe(7); // failIfZero(3)=3, double(3)=6, inc(6)=7
    });
  });
});
