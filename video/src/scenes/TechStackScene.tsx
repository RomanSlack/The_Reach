import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

interface TechBadgeProps {
  name: string;
  color: string;
  delay: number;
}

const TechBadge: React.FC<TechBadgeProps> = ({ name, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 10, stiffness: 150 },
    from: 0,
    to: 1,
  });

  const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "12px 24px",
        backgroundColor: color,
        borderRadius: 8,
        transform: `scale(${scale})`,
        opacity,
        boxShadow: `0 4px 20px ${color}40`,
      }}
    >
      <span
        style={{
          fontFamily: "Arial, sans-serif",
          fontSize: 22,
          fontWeight: "bold",
          color: "#ffffff",
        }}
      >
        {name}
      </span>
    </div>
  );
};

export const TechStackScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const titleScale = interpolate(frame, [0, 15], [0.8, 1], {
    extrapolateRight: "clamp",
  });

  const techStack = [
    { name: "React 19", color: "#61DAFB", delay: 15 },
    { name: "Babylon.js", color: "#BB464B", delay: 20 },
    { name: "Vite", color: "#646CFF", delay: 25 },
    { name: "Tailwind CSS", color: "#06B6D4", delay: 30 },
    { name: "Tauri 2", color: "#FFC131", delay: 35 },
    { name: "FastAPI", color: "#009688", delay: 40 },
    { name: "PostgreSQL", color: "#4169E1", delay: 45 },
    { name: "Zustand", color: "#443E38", delay: 50 },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
      }}
    >
      {/* Title */}
      <h2
        style={{
          fontFamily: "Georgia, serif",
          fontSize: 64,
          color: "#ffffff",
          marginBottom: 60,
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
          textShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        }}
      >
        Built With
      </h2>

      {/* Tech Stack Grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          justifyContent: "center",
          maxWidth: 900,
        }}
      >
        {techStack.map((tech) => (
          <TechBadge
            key={tech.name}
            name={tech.name}
            color={tech.color}
            delay={tech.delay}
          />
        ))}
      </div>

      {/* Claude Code badge */}
      <div
        style={{
          marginTop: 50,
          opacity: interpolate(frame, [55, 70], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 32px",
            backgroundColor: "rgba(255, 165, 0, 0.15)",
            border: "2px solid #FFA500",
            borderRadius: 12,
          }}
        >
          <span style={{ fontSize: 28 }}>🤖</span>
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: 24,
              color: "#FFA500",
              fontWeight: "bold",
            }}
          >
            Made with Claude Code
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
