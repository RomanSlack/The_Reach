import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100 },
    from: 0.5,
    to: 1,
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textY = interpolate(frame, [20, 40], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaScale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 10, stiffness: 120 },
    from: 0.8,
    to: 1,
  });

  const pulseScale =
    1 + 0.03 * Math.sin((frame - 60) * 0.15) * (frame > 60 ? 1 : 0);

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Animated background glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(220, 38, 38, 0.2) 0%, transparent 70%)",
          opacity: interpolate(frame, [30, 50], [0, 1]),
          transform: `scale(${1 + 0.1 * Math.sin(frame * 0.05)})`,
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          opacity,
          filter: "drop-shadow(0 0 30px rgba(220, 38, 38, 0.5))",
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 150,
            height: 150,
          }}
        />
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: "Georgia, serif",
          fontSize: 80,
          fontWeight: "bold",
          color: "#ffffff",
          marginTop: 20,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          textShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          letterSpacing: 6,
        }}
      >
        THE REACH
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontFamily: "Arial, sans-serif",
          fontSize: 28,
          color: "rgba(255, 255, 255, 0.8)",
          marginTop: 10,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
        }}
      >
        Project management that makes you want to keep going
      </p>

      {/* CTA */}
      <div
        style={{
          marginTop: 50,
          opacity: ctaOpacity,
          transform: `scale(${ctaScale * pulseScale})`,
        }}
      >
        <div
          style={{
            padding: "20px 50px",
            backgroundColor: "#dc2626",
            borderRadius: 12,
            boxShadow: "0 8px 30px rgba(220, 38, 38, 0.4)",
          }}
        >
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: 28,
              fontWeight: "bold",
              color: "#ffffff",
              letterSpacing: 2,
            }}
          >
            github.com/The_Reach
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
