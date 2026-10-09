// A live, animated avatar canvas bound to an AvatarRenderer instance.

import { useEffect, useRef } from 'react';
import type { EnvironmentId } from '../../shared/types.ts';
import { AvatarRenderer, type RendererOptions } from '../avatar/renderer.ts';
import type { AvatarProfile } from '../avatar/types.ts';

interface Props {
  profile: AvatarProfile;
  environment?: EnvironmentId;
  backgroundImage?: HTMLImageElement | null;
  options?: RendererOptions;
  className?: string;
  onReady?: (renderer: AvatarRenderer) => void;
  ariaLabel?: string;
}

export function LiveAvatar({ profile, environment, backgroundImage, options, className, onReady, ariaLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new AvatarRenderer(canvas, profile, options);
    rendererRef.current = renderer;
    if (environment) renderer.setEnvironment(environment);
    renderer.start();
    onReady?.(renderer);
    return () => {
      renderer.stop();
      rendererRef.current = null;
    };
    // The renderer is recreated only when the character changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  useEffect(() => {
    if (environment) rendererRef.current?.setEnvironment(environment);
  }, [environment]);

  useEffect(() => {
    rendererRef.current?.setBackgroundImage(backgroundImage ?? null);
  }, [backgroundImage]);

  return <canvas ref={canvasRef} className={className} role="img" aria-label={ariaLabel ?? `${profile.name} (AI simulation)`} />;
}
