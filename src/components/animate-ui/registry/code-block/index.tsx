/** Animate UI v2.1.2 Registry source. Copyright (c) 2025 Elliot Sutton. MIT + Commons Clause. See THIRD_PARTY_NOTICES.md. */
'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import {
  CopyButton,
  CopyButtonIcon,
} from '@animate-ui/react/primitives/buttons/copy';
import {
  CodeBlock as CodeBlockPrimitive,
  type CodeBlockProps as CodeBlockPrimitiveProps,
} from '@animate-ui/react/primitives/code-block';
import { cn } from '@/lib/cn';

type CodeBlockProps = CodeBlockPrimitiveProps & {
  cursor?: boolean;
  copyButton?: boolean;
  scrollClassName?: string;
};

function CodeBlock({
  code,
  cursor = true,
  copyButton = true,
  className,
  scrollClassName,
  ...props
}: CodeBlockProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  return (
    <div data-slot="code-block-frame" className={cn('relative', className)}>
      <div
        ref={scrollRef}
        className={cn(
          'max-h-96 overflow-auto rounded-xl bg-accent p-4 text-sm',
          scrollClassName,
        )}
      >
        <CodeBlockPrimitive
          code={code}
          scrollContainerRef={scrollRef}
          className={cn(
            '[&_code]:text-[13px]! [&>pre,_&_code]:border-none [&>pre,_&_code]:bg-transparent!',
            cursor &&
              "data-[done=false]:[&_.line:last-of-type::after]:inline-block data-[done=false]:[&_.line:last-of-type::after]:w-[1ch] data-[done=false]:[&_.line:last-of-type::after]:content-['|']",
          )}
          {...props}
        />
      </div>
      {copyButton && (
        <CopyButton
          content={code}
          aria-label="Copy code"
          className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
        >
          <CopyButtonIcon
            icon={<Copy/>}
            copiedIcon={<Check/>}
          />
        </CopyButton>
      )}
    </div>
  );
}

export { CodeBlock, type CodeBlockProps };
