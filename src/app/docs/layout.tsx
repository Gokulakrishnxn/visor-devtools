import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/docs-shell";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s · V.I.S.O.R. Docs" },
};

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return <DocsShell>{children}</DocsShell>;
}
