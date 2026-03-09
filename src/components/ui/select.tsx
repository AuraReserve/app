"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Label registry: stores value→label mappings so SelectValue can look up
// labels synchronously without waiting for effects.
type LabelMap = Map<string, string>

const SelectContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  value: string
  onValueChange: (value: string, label: string) => void
  labelMapRef: React.MutableRefObject<LabelMap>
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>
  // Counter that increments when items register, so SelectValue can re-read
  registrationTick: number
  bumpRegistration: () => void
}>({
  open: false,
  setOpen: () => {},
  value: "",
  onValueChange: () => {},
  labelMapRef: { current: new Map() },
  triggerRef: { current: null },
  registrationTick: 0,
  bumpRegistration: () => {},
})

const Select = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value?: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }
>(({ className, value, onValueChange, children, ...props }, ref) => {
  const [open, setOpen] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState(value || "")
  const [registrationTick, setRegistrationTick] = React.useState(0)
  const labelMapRef = React.useRef<LabelMap>(new Map())
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)

  // Sync external value changes
  React.useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value)
    }
  }, [value])

  const handleValueChange = React.useCallback(
    (newValue: string, newLabel: string) => {
      setInternalValue(newValue)
      labelMapRef.current.set(newValue, newLabel)
      onValueChange?.(newValue)
      setOpen(false)
    },
    [onValueChange]
  )

  const bumpRegistration = React.useCallback(() => {
    setRegistrationTick((t) => t + 1)
  }, [])

  const ctx = React.useMemo(
    () => ({
      open,
      setOpen,
      value: internalValue,
      onValueChange: handleValueChange,
      labelMapRef,
      triggerRef,
      registrationTick,
      bumpRegistration,
    }),
    [open, internalValue, handleValueChange, registrationTick, bumpRegistration]
  )

  return (
    <SelectContext.Provider value={ctx}>
      <div ref={ref} className={cn("relative", className)} {...props}>
        {children}
      </div>
    </SelectContext.Provider>
  )
})
Select.displayName = "Select"

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { setOpen, open, triggerRef } = React.useContext(SelectContext)

  return (
    <button
      ref={(node) => {
        triggerRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      }}
      type="button"
      role="combobox"
      aria-expanded={open}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { placeholder?: string }
>(({ className, placeholder, ...props }, ref) => {
  const { value, labelMapRef, registrationTick } = React.useContext(SelectContext)

  // Look up the label from the registry (registrationTick ensures re-render after items register)
  void registrationTick
  const label = value ? labelMapRef.current.get(value) : undefined

  return (
    <span ref={ref} className={cn(value ? "" : "text-muted-foreground", className)} {...props}>
      {value ? label || "" : placeholder}
    </span>
  )
})
SelectValue.displayName = "SelectValue"

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen, triggerRef } = React.useContext(SelectContext)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = React.useState<{ top: number; left: number; width: number } | null>(null)

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node
      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedContent = contentRef.current?.contains(target)
      const clickedTrigger = triggerRef.current?.contains(target)
      if (!clickedContent && !clickedTrigger) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open, setOpen, triggerRef])

  React.useLayoutEffect(() => {
    if (!open) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)

    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open, triggerRef])

  // Always render children hidden for label registration; portal when open
  return (
    <>
      {(!open || !position) && (
        <div style={{ display: "none" }} aria-hidden="true">
          {children}
        </div>
      )}
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setRefs}
            className={cn(
              "fixed z-[60] max-h-96 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md",
              className
            )}
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
            {...props}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
})
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, children, value, ...props }, ref) => {
  const { value: selectedValue, onValueChange, labelMapRef, bumpRegistration } =
    React.useContext(SelectContext)
  const isSelected = selectedValue === value
  const itemRef = React.useRef<HTMLDivElement | null>(null)

  // Register label in the map via useLayoutEffect (fires before paint)
  React.useLayoutEffect(() => {
    if (itemRef.current) {
      const text = itemRef.current.textContent || ""
      if (text) {
        const prev = labelMapRef.current.get(value)
        if (prev !== text) {
          labelMapRef.current.set(value, text)
          // Only bump when this is the selected item so SelectValue re-renders
          if (isSelected) {
            bumpRegistration()
          }
        }
      }
    }
  })

  const handleClick = () => {
    const text = itemRef.current?.textContent || ""
    onValueChange(value, text)
  }

  return (
    <div
      ref={(node) => {
        itemRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        isSelected && "bg-accent",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {isSelected && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Check className="h-4 w-4" />
        </span>
      )}
      {children}
    </div>
  )
})
SelectItem.displayName = "SelectItem"

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
