"use client";

import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

interface ClipboardButtonProps {
  /**
   * Text to copy to clipboard
   */
  text: string;
  
  /**
   * Optional text to show on the button
   */
  label?: string;
  
  /**
   * Optional class name to apply to the button
   */
  className?: string;

  /**
   * Optional identifier for tracking copy state
   * @default 'clipboard'
   */
  id?: string;

  /**
   * Whether the button is disabled
   */
  disabled?: boolean;
}

export function ClipboardButton({ text, label, className, id = 'clipboard', disabled }: ClipboardButtonProps) {
  const { copy, isCopied } = useCopyToClipboard();

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={disabled}
      onClick={() => copy(text, id)}
    >
      {isCopied(id) ? (
        <>
          <Check className="h-4 w-4 mr-2" />
          {label || "Copied"}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4 mr-2" />
          {label || "Copy"}
        </>
      )}
    </Button>
  );
}