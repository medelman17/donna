import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "linear-gradient(135deg, #5e6ad2 0%, #484ea8 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        D
      </div>
    ),
    { ...size },
  );
}
