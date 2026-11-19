import { ImageResponse } from "next/og";

export const alt = "V.I.S.O.R. — X-ray vision for AI coding agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          color: "white",
          background: "radial-gradient(90% 120% at 30% 0%, #2d5aa8 0%, #142a52 45%, #07080b 100%)",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 12, color: "#9fb8ef" }}>V.I.S.O.R.</div>
        <div style={{ marginTop: 28, fontSize: 76, lineHeight: 1.05, fontWeight: 600 }}>X-ray vision for AI coding agents.</div>
        <div style={{ marginTop: 28, fontSize: 28, color: "rgba(255,255,255,0.7)" }}>
          Span-level tracing · mid-flight overrides · real-money cost control
        </div>
      </div>
    ),
    size,
  );
}
