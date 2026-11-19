export function NoToken() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="font-semibold tracking-[0.16em]">V.I.S.O.R.</p>
        <p className="mt-3 text-[14px] text-muted-foreground">
          This page needs the local daemon's session token. Run <code className="font-mono text-foreground">pnpm dev</code> and open the link it prints
          (it ends in <code className="font-mono text-foreground">?token=…</code>).
        </p>
      </div>
    </div>
  );
}
