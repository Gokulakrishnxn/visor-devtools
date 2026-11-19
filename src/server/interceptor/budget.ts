import type { MicroUsd } from "@shared/money";

export type BudgetStatus = "ok" | "warning" | "exceeded";

export type BudgetCheck = {
  status: BudgetStatus;
  spent: MicroUsd;
  cap: MicroUsd | null;
  remaining: MicroUsd | null;
};

/**
 * Hard USD kill-switch (PRD §3, layer 2). Checked before every tool call;
 * once spend reaches the cap the session must abort. Warns at 80%.
 */
export class BudgetWatchdog {
  constructor(
    private readonly sessionCap: MicroUsd | null,
    private readonly turnCap: MicroUsd | null = null,
  ) {}

  check(sessionSpent: MicroUsd, turnSpent: MicroUsd = 0): BudgetCheck {
    const over = (spent: MicroUsd, cap: MicroUsd | null) => cap !== null && spent >= cap;
    const near = (spent: MicroUsd, cap: MicroUsd | null) => cap !== null && spent * 5 >= cap * 4;
    const status: BudgetStatus =
      over(sessionSpent, this.sessionCap) || over(turnSpent, this.turnCap)
        ? "exceeded"
        : near(sessionSpent, this.sessionCap) || near(turnSpent, this.turnCap)
          ? "warning"
          : "ok";
    return {
      status,
      spent: sessionSpent,
      cap: this.sessionCap,
      remaining: this.sessionCap === null ? null : Math.max(0, this.sessionCap - sessionSpent),
    };
  }
}
