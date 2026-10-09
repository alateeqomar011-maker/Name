import type { Emotion } from '../../shared/text.ts';
import type { EnvironmentId, Look } from '../../shared/types.ts';

export interface AvatarProfile {
  id: string;
  name: string;
  gender: 'm' | 'f';
  colors: [string, string];
  look: Look;
  environment: EnvironmentId;
}

export type AvatarState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

/** Mouth pose produced by lip sync (all 0..1 except wide which is -1..1). */
export interface MouthShape {
  open: number;
  wide: number;
  round: number;
  teeth: number;
}

export interface FaceParams {
  yaw: number;
  pitch: number;
  roll: number;
  gazeX: number;
  gazeY: number;
  eyeOpen: number;
  squint: number;
  browRaise: number;
  browFurrow: number;
  browAsym: number;
  smile: number;
  jaw: number;
  wide: number;
  round: number;
  teeth: number;
  breath: number;
}

export type Framing = 'call' | 'tile' | 'portrait' | 'orb';

export type { Emotion };
