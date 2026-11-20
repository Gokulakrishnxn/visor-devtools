import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteIcon } from "@/components/visor/site-icon";
import { cn } from "@/lib/utils";

// Claude's replies are Markdown. Raw HTML in them is never rendered (react-markdown's default).
const components: Components = {
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-indigo underline decoration-indigo/40 underline-offset-2 hover:decoration-indigo">
      {href && <SiteIcon href={href} size={14} className="mr-1.5 -mt-0.5 align-middle" />}
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 marker:text-white/35">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-white/45">{children}</ol>,
  h1: ({ children }) => <h3 className="mb-2 mt-5 text-[17px] font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-5 text-[16px] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-4 text-[15px] font-semibold">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-white/15 pl-3 text-white/70">{children}</blockquote>,
  hr: () => <hr className="my-4 border-white/10" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-white/15 px-2 py-1.5 text-left font-medium text-white/80">{children}</th>,
  td: ({ children }) => <td className="border-b border-white/[0.06] px-2 py-1.5">{children}</td>,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[12.5px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={cn("rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.86em] text-foreground", className)}>{children}</code>
  ),
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
