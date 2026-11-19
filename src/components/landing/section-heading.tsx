import { Reveal } from "./reveal";

export function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: React.ReactNode;
}) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent/80">{eyebrow}</p>
      <h2 className="mt-4 text-balance font-display text-3xl font-medium leading-tight tracking-tight text-fg sm:text-5xl">
        {title}
      </h2>
      {body && <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">{body}</p>}
    </Reveal>
  );
}
