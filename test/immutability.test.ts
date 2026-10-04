import { describe, expect, it } from "bun:test";
import lowdeep from "../src/index";

describe("builder immutability", () => {
  it("ensures branches from a base builder do not mutate each other", () => {
    const base = lowdeep().key("sk_test_key").model("gpt-4o-mini");

    const agentFinance = base.system("You are a financial advisor.");
    const agentChef = base.system("You are a professional chef.");

    // Deriving one does not overwrite the other
    expect(agentFinance).not.toBe(agentChef);
    expect(agentFinance).not.toBe(base);
  });

  it("isolates conversation histories between cloned or branched builders", () => {
    const base = lowdeep()
      .key("sk_test_key")
      .model("gpt-4o-mini")
      .use([{ role: "user", content: "Initial shared context" }]);

    const branchA = base.clone();
    const branchB = base.clone();

    // Adding message to branchA's history
    branchA.use([
      ...branchA.getHistory(),
      { role: "user", content: "Message for A" },
    ]);

    expect(branchA.getHistory()).toHaveLength(2);
    expect(branchB.getHistory()).toHaveLength(1);
    expect(base.getHistory()).toHaveLength(1);
  });
});
