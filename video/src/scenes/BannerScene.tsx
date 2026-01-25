import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const BannerScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
    from: 1.2,
    to: 1,
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const panX = interpolate(frame, [0, 120], [0, -50], {
    extrapolateRight: "clamp",
  });

  const panY = interpolate(frame, [0, 120], [0, -20], {
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textY = interpolate(frame, [30, 50], [50, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const highlightWidth = interpolate(frame, [50, 80], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {/* Banner Image with Ken Burns effect */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          opacity,
        }}
      >
        <Img
          src={staticFile("banner.jpg")}
          style={{
            width: "120%",
            height: "120%",
            objectFit: "cover",
            transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
          }}
        />
        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "50%",
            background: "linear-gradient(transparent, rgba(0, 0, 0, 0.8))",
          }}
        />
      </div>

      {/* Text overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 100,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 64,
              color: "#ffffff",
              margin: 0,
              textShadow: "0 4px 20px rgba(0, 0, 0, 0.8)",
            }}
          >
            Your projects as living worlds
          </h2>
          <div
            style={{
              position: "absolute",
              bottom: 5,
              left: 0,
              height: 4,
              width: `${highlightWidth}%`,
              backgroundColor: "#dc2626",
              borderRadius: 2,
            }}
          />
        </div>
        <p
          style={{
            fontFamily: "Arial, sans-serif",
            fontSize: 28,
            color: "rgba(255, 255, 255, 0.8)",
            marginTop: 20,
            maxWidth: 700,
          }}
        >
          Each project becomes a procedurally generated settlement that evolves
          as you make progress
        </p>
      </div>
    </AbsoluteFill>
  );
};
