import { AbsoluteFill, Series } from "remotion";
import { IntroScene } from "./scenes/IntroScene";
import { BannerScene } from "./scenes/BannerScene";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { TechStackScene } from "./scenes/TechStackScene";
import { OutroScene } from "./scenes/OutroScene";

export const TheReachVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      <Series>
        <Series.Sequence durationInFrames={90}>
          <IntroScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <BannerScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <FeaturesScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <TechStackScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
