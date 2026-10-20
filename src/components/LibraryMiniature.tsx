import { Check, ChevronDown, ChevronLeft, ChevronRight, Quote, Star, TrendingUp } from 'lucide-react';
import type { ComponentType } from '../model';
import '../library-miniatures.css';

export function LibraryMiniature({ type }: { type: ComponentType }) {
  switch (type) {
    case 'textarea': return <span className="mini-textarea"><i /><i /><i /></span>;
    case 'select': return <span className="mini-input">选择一个选项<ChevronDown size={10} /></span>;
    case 'checkbox': return <span className="mini-choice"><b><Check size={10} /></b>接收灵感周刊</span>;
    case 'radio': return <span className="mini-radio"><span><b />个人创作</span><span><i />团队协作</span></span>;
    case 'slider': return <span className="mini-slider"><i /><b /></span>;
    case 'avatar': return <span className="mini-avatar-row"><b>林</b><span><i /><i /></span></span>;
    case 'progress': return <span className="mini-progress"><span>完成进度<b>72%</b></span><i /></span>;
    case 'statistic': return <span className="mini-statistic"><span>本月访问<TrendingUp size={10} /></span><strong>12,840</strong><small>↗ 18.6%</small></span>;
    case 'table': return <span className="mini-table">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>;
    case 'timeline': return <span className="mini-timeline"><i /><i /><i /></span>;
    case 'testimonial': return <span className="mini-testimonial"><Quote size={14} /><i /><i /><b /></span>;
    case 'pricing': return <span className="mini-pricing"><small>创作进阶</small><strong>¥99 <small>/ 月</small></strong><i /><b /></span>;
    case 'breadcrumb': return <span className="mini-breadcrumb">首页<ChevronRight size={9} /><b>作品</b></span>;
    case 'pagination': return <span className="mini-pagination"><ChevronLeft size={10} /><b>1</b><span>2</span><span>3</span><ChevronRight size={10} /></span>;
    case 'rating': return <span className="mini-rating">{[1, 2, 3, 4, 5].map(n => <Star size={13} key={n} fill={n <= 4 ? 'currentColor' : 'none'} />)}</span>;
    default: return null;
  }
}
