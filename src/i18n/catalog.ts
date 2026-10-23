import { blockName as sourceBlockName, type Block, type ComponentType } from '../model.ts';
import { t } from './index.ts';

export const blockName = (type: ComponentType) => t(sourceBlockName(type));
// Names authored by users are content, even if they happen to match a translation key.
export const blockLabel = (block: Pick<Block, 'type' | 'props'>) =>
  block.type === 'custom' ? block.props.custom?.name || t('自定义组件') : blockName(block.type);
