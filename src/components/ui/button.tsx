"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { motion, useReducedMotion } from "motion/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { LoaderCircle } from "lucide-react"
import { forwardRef } from "react"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "game-button bg-primary text-primary-foreground hover:bg-lime-300",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 gap-2 px-4",
        xs: "h-8 gap-1 px-2 text-xs",
        sm: "h-9 gap-2 px-3",
        lg: "h-12 gap-2 px-6",
        icon: "size-11",
        "icon-xs": "size-8",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = forwardRef<HTMLButtonElement, ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean; loadingText?: string }>(function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  loadingText,
  disabled,
  children,
  render,
  ...props
}, ref) {
  const reduced = useReducedMotion()
  const interactive = variant === "default" && !disabled && !loading && !reduced
  return (
    <ButtonPrimitive
      ref={ref}
      render={render ?? <motion.button whileTap={interactive ? { scale: 0.97 } : undefined} transition={{ type: "spring", stiffness: 450, damping: 28 }} />}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
      {loading ? loadingText ?? children : children}
    </ButtonPrimitive>
  )
})

export { Button, buttonVariants }
