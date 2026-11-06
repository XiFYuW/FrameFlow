import React from "react";
import { Composition } from "remotion";
import { FrameFlowVideo } from "./Video";
import {
  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
} from "./timeline";

// Keep 45 tail frames (1.5s) so the last subtitle can settle.
const DURATION = totalDurationInFrames + 45;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FrameFlow"
      component={FrameFlowVideo}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
