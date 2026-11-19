import { siClaude, siGithub, siGooglegemini } from "simple-icons";

type Mark = { path: string; title: string; hex: string };

function BrandIcon({
  mark,
  size = 16,
  color = "currentColor",
  className,
}: {
  mark: Mark;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      role="img"
      aria-label={mark.title}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      className={className}
    >
      <path d={mark.path} />
    </svg>
  );
}

type IconProps = { size?: number; className?: string; brand?: boolean };

export function GitHubIcon({ size, className }: IconProps) {
  return <BrandIcon mark={siGithub} size={size} className={className} />;
}

export function ClaudeIcon({ size, className, brand = true }: IconProps) {
  return (
    <BrandIcon
      mark={siClaude}
      size={size}
      className={className}
      color={brand ? `#${siClaude.hex}` : "currentColor"}
    />
  );
}

/** Gemini's four-point spark, in its blue-to-violet gradient. */
export function GeminiIcon({ size = 16, className, brand = true }: IconProps) {
  return (
    <svg role="img" aria-label="Gemini" viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id="gemini-spark" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1C7DFF" />
          <stop offset="0.52" stopColor="#1C69FF" />
          <stop offset="1" stopColor="#B987FF" />
        </linearGradient>
      </defs>
      <path d={siGooglegemini.path} fill={brand ? "url(#gemini-spark)" : "currentColor"} />
    </svg>
  );
}
