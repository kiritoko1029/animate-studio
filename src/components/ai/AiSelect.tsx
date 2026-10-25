import { Check, ChevronDown } from 'lucide-react';
import { StudioButton } from '../StudioUI';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItemIndicator } from '../animate-ui/components/radix/dropdown-menu';

export function AiSelect({ label, value, options, onChange, disabled = false, placeholder = '' }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return <DropdownMenu><DropdownMenuTrigger asChild><StudioButton className="secondary-button ai-select" aria-label={label} disabled={disabled}>
    <span>{options.find(option => option.value === value)?.label || value || placeholder}</span><ChevronDown size={13}/>
  </StudioButton></DropdownMenuTrigger><DropdownMenuContent className="studio-menu ai-select-menu" sideOffset={5} align="start" aria-label={label}>
    <DropdownMenuRadioGroup value={value} onValueChange={onChange}>{options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>
      <span>{option.label}</span><DropdownMenuItemIndicator className="ai-option-check"><Check size={13}/></DropdownMenuItemIndicator>
    </DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
  </DropdownMenuContent></DropdownMenu>;
}
