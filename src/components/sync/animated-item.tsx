"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { itemVariants } from "./tokens";

export interface AnimatedItemProps extends Omit<
  HTMLMotionProps<"div">,
  "children"
> {
  children: ReactNode;
  highlightOnEnter?: boolean;
  layout?: boolean | "position" | "size" | "preserve-aspect";
  className?: string;
}

export function AnimatedItem({
  children,
  highlightOnEnter = false,
  layout = false,
  className,
  ...rest
}: AnimatedItemProps) {
  return (
    <motion.div
      layout={layout}
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(highlightOnEnter && "animate-saved-pulse-bg", className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export { AnimatePresence } from "framer-motion";
