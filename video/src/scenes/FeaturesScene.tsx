import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  delay: number;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100 },
    from: 0,
    to: 1,
  });

  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const y = interpolate(frame, [delay, delay + 20], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 30,
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        borderRadius: 20,
        border: "1px solid rgba(255, 255, 255, 0.1)",
        width: 280,
        transform: `scale(${scale}) translateY(${y}px)`,
        opacity,
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          fontSize: 60,
          marginBottom: 15,
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          fontFamily: "Arial, sans-serif",
          fontSize: 24,
          fontWeight: "bold",
          color: "#ffffff",
          margin: 0,
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: "Arial, sans-serif",
          fontSize: 16,
          color: "rgba(255, 255, 255, 0.7)",
          margin: 0,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
};

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const titleY = interpolate(frame, [0, 20], [-30, 0], {
    extrapolateRight: "clamp",
  });

  const features = [
    {
      icon: "🏔️",
      title: "Procedural Terrain",
      description: "FBM noise landscapes with lakes, rocks, and vegetation",
    },
    {
      icon: "🐑",
      title: "Living Ecosystem",
      description: "Sheep grazing, birds flying, fish swimming, ducks splashing",
    },
    {
      icon: "🌅",
      title: "Dynamic Lighting",
      description: "Day/night cycle with stars, campfire glow, and smoke",
    },
    {
      icon: "🏰",
      title: "Settlement Evolution",
      description: "Camps upgrade from tents to castles as you progress",
    },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
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
          fontSize: 72,
          color: "#ffffff",
          marginBottom: 60,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        }}
      >
        Features
      </h2>

      {/* Feature Cards Grid */}
      <div
        style={{
          display: "flex",
          gap: 40,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1400,
        }}
      >
        {features.map((feature, index) => (
          <Sequence key={feature.title} from={0} layout="none">
            <FeatureCard
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              delay={20 + index * 15}
            />
          </Sequence>
        ))}
      </div>
    </AbsoluteFill>
  );
};
