import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const logoRotation = interpolate(frame, [0, 30], [180, 0], {
    extrapolateRight: "clamp",
  });

  const titleOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleY = interpolate(frame, [30, 50], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subtitleOpacity = interpolate(frame, [45, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowIntensity = interpolate(frame, [50, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
      {/* Animated particles background */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {[...Array(20)].map((_, i) => {
          const delay = i * 3;
          const particleY = interpolate(
            frame,
            [delay, delay + 90],
            [110, -10],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${5 + (i * 4.7)}%`,
                top: `${particleY}%`,
                width: 4,
                height: 4,
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.3)",
                opacity: interpolate(frame, [delay, delay + 45, delay + 90], [0, 0.5, 0]),
              }}
            />
          );
        })}
      </div>

      {/* Logo */}
      <div
        style={{
          transform: `scale(${logoScale}) rotate(${logoRotation}deg)`,
          filter: `drop-shadow(0 0 ${30 * glowIntensity}px rgba(220, 38, 38, 0.6))`,
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 200,
            height: 200,
          }}
        />
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: "Georgia, serif",
          fontSize: 100,
          fontWeight: "bold",
          color: "#ffffff",
          marginTop: 30,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          letterSpacing: 8,
        }}
      >
        THE REACH
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: "Arial, sans-serif",
          fontSize: 36,
          color: "#dc2626",
          opacity: subtitleOpacity,
          marginTop: 10,
          letterSpacing: 12,
          textTransform: "uppercase",
        }}
      >
        3D Project Scape
      </p>
    </AbsoluteFill>
  );
};
