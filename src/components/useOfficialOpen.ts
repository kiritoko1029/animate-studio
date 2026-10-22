import { useEffect, useRef, useState } from 'react';
import type { Block } from '../model';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';

/** Inspector changes establish the preview state; the primitive still controls subsequent user interaction. */
export function useOfficialOpen(block:Block,group:string) {
 const settings=officialAnimationProps(block.type,group,block.props.motion);
 const configured=settings.open ?? settings.defaultOpen ?? false;
 const [open,setOpen]=useState(Boolean(configured));
 const previous=useRef(configured);
 useEffect(()=>{if(previous.current!==configured){previous.current=configured;setOpen(Boolean(configured));}},[configured]);
 return {open,onOpenChange:setOpen};
}
