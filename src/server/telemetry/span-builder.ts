import type { SpanStatus, SpanType, VisorEvent } from "@shared/events";

export type SpanNode = {
  spanId: string;
  parentSpanId: string | null;
  turnId: string;
  spanType: SpanType;
  name: string;
  filePath?: string;
  status: SpanStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  costMicroUsd: number;
  /** Streamed text (thinking, stdout), appended from span.delta events. */
  text: string;
  input?: unknown;
  output?: unknown;
  diff?: string;
  error?: string;
  children: SpanNode[];
};

/**
 * Folds a VisorEvent stream into a parent/child span tree
 * (session → turn → llm / tool / subagent), OpenTelemetry style.
 */
export class SpanTreeBuilder {
  private readonly nodes = new Map<string, SpanNode>();
  private readonly roots: SpanNode[] = [];

  apply(event: VisorEvent): void {
    switch (event.type) {
      case "span.started": {
        const node: SpanNode = {
          spanId: event.spanId,
          parentSpanId: event.parentSpanId,
          turnId: event.turnId,
          spanType: event.spanType,
          name: event.name,
          filePath: event.filePath,
          status: "running",
          startedAt: event.at,
          costMicroUsd: 0,
          text: "",
          input: event.input,
          children: [],
        };
        this.nodes.set(node.spanId, node);
        const parent = event.parentSpanId ? this.nodes.get(event.parentSpanId) : undefined;
        if (parent) parent.children.push(node);
        else this.roots.push(node);
        break;
      }
      case "span.delta": {
        const node = this.nodes.get(event.spanId);
        if (node) node.text += event.text;
        break;
      }
      case "breakpoint.paused": {
        const node = this.nodes.get(event.spanId);
        if (node) node.status = "paused";
        break;
      }
      case "span.ended": {
        const node = this.nodes.get(event.spanId);
        if (!node) break;
        node.status = event.status;
        node.endedAt = event.at;
        node.durationMs = Math.max(0, event.at - node.startedAt);
        node.costMicroUsd = event.costMicroUsd;
        node.output = event.output;
        node.diff = event.diff;
        node.error = event.error;
        break;
      }
      default:
        break;
    }
  }

  get(spanId: string): SpanNode | undefined {
    return this.nodes.get(spanId);
  }

  tree(): SpanNode[] {
    return this.roots;
  }

  /** Cost of a span including all of its descendants, in µUSD. */
  rolledUpCost(spanId: string): number {
    const node = this.nodes.get(spanId);
    if (!node) return 0;
    return node.children.reduce((n, c) => n + this.rolledUpCost(c.spanId), node.costMicroUsd);
  }

  /** Depth-first list, handy for J/K navigation in the GUI. */
  flatten(): SpanNode[] {
    const out: SpanNode[] = [];
    const walk = (n: SpanNode) => {
      out.push(n);
      n.children.forEach(walk);
    };
    this.roots.forEach(walk);
    return out;
  }
}
