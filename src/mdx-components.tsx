import type { MDXComponents } from "mdx/types";
import { Card, CardGroup, Field, Heading, Note, Pre, Step, Steps, Tip, Warning } from "@/components/docs/mdx";
import { Tab, Tabs } from "@/components/docs/tabs";

const components: MDXComponents = {
  h2: ({ children }) => <Heading as="h2">{children}</Heading>,
  h3: ({ children }) => <Heading as="h3">{children}</Heading>,
  pre: Pre,
  Note,
  Tip,
  Warning,
  Steps,
  Step,
  Card,
  CardGroup,
  Tabs,
  Tab,
  Field,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
