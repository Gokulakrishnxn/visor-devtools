import Link from "next/link";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { AlertTriangle, Info, Lightbulb, ArrowUpRight } from "lucide-react";
import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/cn";
import { CopyButton } from "./copy-button";

export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export function Heading({ as: Tag, children }: { as: "h2" | "h3"; children: ReactNode }) {
  const id = slug(textOf(children));
  return (
    <Tag id={id} className="group scroll-mt-24">
      <a href={`#${id}`} className="no-underline">
        {children}
        <span className="ml-2 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">#</span>
      </a>
    </Tag>
  );
}

/** Fenced code blocks: highlighted on the server with Shiki, with a copy button. */
export async function Pre({ children }: { children?: ReactNode }) {
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const lang = code?.props.className?.replace("language-", "") ?? "text";
  const text = textOf(code?.props.children ?? children).replace(/\n$/, "");
  const html = await highlight(text, lang);
  return (
    <div className="group relative my-6 overflow-hidden rounded-xl border border-line bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-line px-4 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">{lang}</span>
        <CopyButton text={text} />
      </div>
      <div
        className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-6 [&_pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

const calloutStyles = {
  note: { icon: Info, cls: "border-accent/25 bg-accent/[0.06]", ico: "text-accent" },
  tip: { icon: Lightbulb, cls: "border-emerald/25 bg-emerald/[0.06]", ico: "text-emerald" },
  warning: { icon: AlertTriangle, cls: "border-amber/30 bg-amber/[0.06]", ico: "text-amber" },
};

function Callout({ type, children }: { type: keyof typeof calloutStyles; children: ReactNode }) {
  const s = calloutStyles[type];
  return (
    <div className={cn("my-6 flex gap-3 rounded-xl border px-4 py-3.5 text-[15px] [&>p]:m-0", s.cls)}>
      <s.icon size={18} className={cn("mt-0.5 shrink-0", s.ico)} />
      <div className="min-w-0 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{children}</div>
    </div>
  );
}

export const Note = ({ children }: { children: ReactNode }) => <Callout type="note">{children}</Callout>;
export const Tip = ({ children }: { children: ReactNode }) => <Callout type="tip">{children}</Callout>;
export const Warning = ({ children }: { children: ReactNode }) => <Callout type="warning">{children}</Callout>;

type StepProps = { title: string; children: ReactNode };
export function Step({ children }: StepProps) {
  return <>{children}</>;
}
export function Steps({ children }: { children: ReactNode }) {
  const steps = Children.toArray(children).filter(isValidElement) as ReactElement<StepProps>[];
  return (
    <ol className="not-prose my-8 ml-3.5 border-l border-line">
      {steps.map((s, i) => (
        <li key={i} className="relative pb-8 pl-8 last:pb-0">
          <span className="absolute -left-3.5 top-0 flex size-7 items-center justify-center rounded-full border border-line-strong bg-panel font-mono text-xs text-fg">
            {i + 1}
          </span>
          <p className="!mt-0.5 font-medium text-fg">{s.props.title}</p>
          <div className="mt-2 text-fg-muted [&>p:first-child]:mt-0">{s.props.children}</div>
        </li>
      ))}
    </ol>
  );
}

export function CardGroup({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn("my-6 grid gap-3", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>;
}

export function Card({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-line bg-panel/60 p-4 no-underline transition-colors hover:border-accent/40"
    >
      <span className="flex items-center justify-between font-medium text-fg">
        {title}
        <ArrowUpRight size={15} className="text-fg-faint transition-colors group-hover:text-accent" />
      </span>
      <span className="mt-1 block text-sm leading-relaxed text-fg-muted">{children}</span>
    </Link>
  );
}

export function Field({ name, type, children, required }: { name: string; type: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="border-b border-line py-4 first:border-t">
      <div className="flex flex-wrap items-center gap-2">
        <code className="!bg-transparent !p-0 font-mono text-sm text-accent">{name}</code>
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{type}</span>
        {required && <span className="rounded bg-rose/10 px-1.5 py-0.5 font-mono text-[11px] text-rose">required</span>}
      </div>
      <div className="mt-2 text-[15px] text-fg-muted [&>p]:m-0">{children}</div>
    </div>
  );
}
