import { ImageResponse } from "next/og";

export const alt = "TalentFlow — Hire with clarity. Move talent forward.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview card in the landing palette; no external assets, generated at request time. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background:
          "radial-gradient(55% 55% at 20% 0%, rgba(109,140,255,0.45), transparent 70%), radial-gradient(45% 45% at 90% 20%, rgba(139,92,246,0.4), transparent 70%), #070a12",
        color: "#e6eaf2",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 600 }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "linear-gradient(135deg, #6d8cff, #8b5cf6)",
          }}
        />
        TalentFlow
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02 }}>
          Hire with clarity.
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: -3,
            lineHeight: 1.02,
            color: "#a3b4ff",
          }}
        >
          Move talent forward.
        </div>
        <div style={{ fontSize: 28, color: "#9aa3b5", marginTop: 12 }}>
          Multi-tenant applicant tracking for recruiting teams
        </div>
      </div>
    </div>,
    size,
  );
}
