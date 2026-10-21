import { createContext, useCallback, useContext, useLayoutEffect, useState } from 'react';
import { useMotionValueEvent } from 'motion/react';
import { ScrollProgress, ScrollProgressProvider, useScrollProgress } from '@animate-ui/react/primitives/scroll-progress';
import { pageScrollContainer } from '../lib/scroll-progress';

export const CanvasScrollProgress = createContext<number | null>(null);

function PageProgressValue({ label, direction }: { label:string;direction:'vertical'|'horizontal' }) {
  const canvasProgress = useContext(CanvasScrollProgress);
  const { containerRef, progress } = useScrollProgress();
  const [value,setValue] = useState(0);
  // Register the editor's real scroll surface before the upstream useScroll layout effect.
  const attach = useCallback((node:HTMLDivElement|null)=>{ containerRef.current=node ? pageScrollContainer(node) as HTMLDivElement : null; },[containerRef]);
  useMotionValueEvent(progress,'change',next=>setValue(Math.max(0,Math.min(100,next*100))));
  useLayoutEffect(()=>{ if(canvasProgress!==null && direction==='vertical')progress.set(canvasProgress/100); },[canvasProgress,direction,progress]);
  return <div ref={attach} className="native-scroll-progress"><div className="native-page-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><ScrollProgress className="native-scroll-example-fill"/></div><output aria-label={`${label}百分比`}>{Math.round(value)}%</output></div>;
}

/** Keep the official spring, and adapt its scroll source to the editor's panned/scaled page. */
export function PageScrollProgress({label,direction='vertical'}:{label:string;direction?:'vertical'|'horizontal'}) {
  return <ScrollProgressProvider direction={direction}><PageProgressValue label={label} direction={direction}/></ScrollProgressProvider>;
}
