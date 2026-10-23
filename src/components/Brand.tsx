import { useEffect, useRef } from 'react';
import mark from '../../shared/brand-mark.json';
import { createBrandMotion, type BrandPhase } from '../lib/brand-motion';
import './brand.css';

/** The same authored geometry generates the favicon and downloadable assets. */
export function Brand({ small = false, phase = 'idle' }: { small?: boolean; phase?: BrandPhase }) {
  const keyframe = useRef<SVGGElement>(null);
  const animation = useRef<ReturnType<typeof createBrandMotion> | null>(null);
  useEffect(() => {
    if (!keyframe.current) return;
    const controller = createBrandMotion(keyframe.current);
    animation.current = controller;
    return () => { controller.dispose(); animation.current = null; };
  }, []);
  useEffect(() => { animation.current?.setPhase(phase); }, [phase]);
  return (
    <div className={`brand ${small ? 'small' : ''}`} role={small ? 'img' : undefined} aria-label={small ? 'Animate Studio' : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') animation.current?.hover(); }}
      onPointerLeave={() => animation.current?.leave()} onPointerCancel={() => animation.current?.leave()}>
      <svg className="brand-mark" viewBox={mark.viewBox} aria-hidden="true" focusable="false" fill="currentColor">
        {mark.paths.map(path => path.id === 'keyframe'
          ? <g key={path.id} ref={keyframe} className="brand-keyframe"><path d={path.d} /></g>
          : <path key={path.id} d={path.d} />)}
      </svg>
      {!small && <span>animate<span className="brand-light"> studio</span></span>}
    </div>
  );
}
