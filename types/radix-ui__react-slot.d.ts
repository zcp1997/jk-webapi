declare module "@radix-ui/react-slot" {
  import type * as React from "react";

  export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
    children?: React.ReactNode;
  }

  export const Slot: React.ForwardRefExoticComponent<
    SlotProps & React.RefAttributes<HTMLElement>
  >;

  export { Slot as Root };
}
