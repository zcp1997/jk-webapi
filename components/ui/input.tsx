"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  trailing?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, trailing, ...props }, ref) => {
    if (trailing) {
      return (
        <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2", className)}>
          <input
            type={type}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            ref={ref}
            {...props}
          />
          <div className="text-muted-foreground">{trailing}</div>
        </div>
      );
    }
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
