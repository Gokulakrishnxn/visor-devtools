import type { MetadataRoute } from "next";
import { allDocs } from "@/lib/docs-nav";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: site.url }, ...allDocs.map((d) => ({ url: `${site.url}${d.href}` }))];
}
