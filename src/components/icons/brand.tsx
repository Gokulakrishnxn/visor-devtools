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

export function GeminiIcon({ size, className, brand = true }: IconProps) {
  return (
    <BrandIcon
      mark={siGooglegemini}
      size={size}
      className={className}
      color={brand ? `#${siGooglegemini.hex}` : "currentColor"}
    />
  );
}
