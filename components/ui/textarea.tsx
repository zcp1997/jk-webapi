"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  footer?: React.ReactNode;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, footer, ...props }, ref) => {
    return (
      <div className={cn("space-y-1.5", className)}>
        <textarea
          className={cn(
            "flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          )}
          ref={ref}
          {...props}
        />
        {footer ? (
          <div className="flex justify-between text-xs text-muted-foreground">{footer}</div>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
