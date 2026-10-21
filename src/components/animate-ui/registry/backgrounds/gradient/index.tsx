/** Animate UI v2.1.2 registry source: https://github.com/imskyleen/animate-ui/blob/e6cea6b5ae5a4985d3bf3cc0ebea173555eafd72/apps/v2/registry/backgrounds/gradient/index.tsx
 * Copyright (c) 2025 Elliot Sutton. MIT + Commons Clause. See THIRD_PARTY_NOTICES.md.
 * Local adaptation: cn import path. */
'use client';

import * as React from 'react';
import { motion, useInView, type HTMLMotionProps } from 'motion/react';

import { usePageVisible } from '@animate-ui/react/utils/use-page-visible';
import {
  ReducedMotionConfig,
  useShouldReduceMotion,
} from '@animate-ui/react/utils/motion';
import { cn } from '@/lib/cn';

type GradientBackgroundProps = HTMLMotionProps<'div'>;

const STATIC_POSITION = '0% 50%';

function GradientBackgroundContent({
  ref,
  className,
  transition = { duration: 15, ease: 'easeInOut', repeat: Infinity },
  ...props
}: GradientBackgroundProps) {
  const localRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

  const inView = useInView(localRef);
  const pageVisible = usePageVisible();
  const reduce = useShouldReduceMotion();
  const playing = inView && pageVisible && !reduce;

  return (
    <motion.div
      ref={localRef}
      data-slot="gradient-background"
      className={cn(
        'size-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 bg-[length:400%_400%]',
        className,
      )}
      animate={{
        backgroundPosition: playing
          ? [STATIC_POSITION, '100% 50%', STATIC_POSITION]
          : STATIC_POSITION,
      }}
      transition={playing ? transition : { duration: 0 }}
      {...props}
    />
  );
}

function GradientBackground(props: GradientBackgroundProps) {
  return (
    <ReducedMotionConfig>
      <GradientBackgroundContent {...props} />
    </ReducedMotionConfig>
  );
}

export { GradientBackground, type GradientBackgroundProps };
