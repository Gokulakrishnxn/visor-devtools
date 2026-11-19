import Link from "next/link";
import { ClaudeIcon, GeminiIcon, GitHubIcon } from "@/components/icons/brand";
import { site } from "@/lib/site";
import { Logo } from "./logo";

const groups = [
  {
    title: "Product",
    links: [
      { label: "Pillars", href: "/#pillars" },
      { label: "Features", href: "/#features" },
      { label: "Architecture", href: "/#architecture" },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Introduction", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Overrides", href: "/docs/overrides" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: site.repo },
      { label: "Roadmap", href: "/docs/roadmap" },
      { label: "MIT License", href: `${site.repo}/blob/main/LICENSE` },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo badge={false} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">{site.longName}. {site.tagline}</p>
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="mt-5 inline-flex size-9 items-center justify-center rounded-lg border border-line-strong text-fg-muted transition-colors hover:text-fg"
          >
            <GitHubIcon size={16} />
          </a>
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <p className="text-sm font-medium text-fg">{g.title}</p>
            <ul className="mt-4 space-y-2.5">
              {g.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-fg-muted transition-colors hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-fg-muted sm:flex-row">
          <p>
            Designed &amp; developed by{" "}
            <a href={site.portfolio} target="_blank" rel="noreferrer" className="font-medium text-fg underline decoration-white/25 underline-offset-4 hover:decoration-white">
              {site.author}
            </a>
          </p>
          <p className="flex items-center gap-3">
            <span>Built with</span>
            <span className="flex items-center gap-1.5 text-fg">
              <ClaudeIcon size={15} /> Claude
            </span>
            <span className="text-fg-faint">+</span>
            <span className="flex items-center gap-1.5 text-fg">
              <GeminiIcon size={15} /> Gemini
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
