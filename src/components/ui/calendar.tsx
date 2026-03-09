"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type CalendarProps = {
  mode?: "single" | "range"
  selected?: Date | { from: Date; to?: Date }
  onSelect?: (date: Date | { from: Date; to?: Date } | undefined) => void
  className?: string
  disabled?: (date: Date) => boolean
  month?: Date
  onMonthChange?: (month: Date) => void
}

function Calendar({
  mode = "single",
  selected,
  onSelect,
  className,
  disabled,
  month: controlledMonth,
  onMonthChange,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(
    controlledMonth || new Date()
  )

  const month = controlledMonth || currentMonth

  const handleMonthChange = (newMonth: Date) => {
    if (!controlledMonth) {
      setCurrentMonth(newMonth)
    }
    onMonthChange?.(newMonth)
  }

  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate()

  const firstDayOfMonth = new Date(
    month.getFullYear(),
    month.getMonth(),
    1
  ).getDay()

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]

  const handlePrevMonth = () => {
    const newMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1)
    handleMonthChange(newMonth)
  }

  const handleNextMonth = () => {
    const newMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    handleMonthChange(newMonth)
  }

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(month.getFullYear(), month.getMonth(), day)

    if (disabled && disabled(clickedDate)) {
      return
    }

    if (mode === "single") {
      onSelect?.(clickedDate)
    } else if (mode === "range") {
      const rangeSelected = selected as { from: Date; to?: Date } | undefined
      if (!rangeSelected || (rangeSelected.from && rangeSelected.to)) {
        onSelect?.({ from: clickedDate })
      } else if (rangeSelected.from && !rangeSelected.to) {
        if (clickedDate < rangeSelected.from) {
          onSelect?.({ from: clickedDate, to: rangeSelected.from })
        } else {
          onSelect?.({ from: rangeSelected.from, to: clickedDate })
        }
      }
    }
  }

  const isDateSelected = (day: number) => {
    const date = new Date(month.getFullYear(), month.getMonth(), day)

    if (mode === "single") {
      const singleSelected = selected as Date | undefined
      return (
        singleSelected &&
        date.toDateString() === singleSelected.toDateString()
      )
    } else if (mode === "range") {
      const rangeSelected = selected as { from: Date; to?: Date } | undefined
      if (!rangeSelected) return false

      const time = date.getTime()
      const fromTime = rangeSelected.from.getTime()
      const toTime = rangeSelected.to?.getTime()

      if (toTime) {
        return time >= fromTime && time <= toTime
      }
      return time === fromTime
    }
    return false
  }

  const days = []
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="p-2" />)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day)
    const isDisabled = disabled && disabled(date)
    const isSelected = isDateSelected(day)

    days.push(
      <button
        key={day}
        type="button"
        onClick={() => handleDateClick(day)}
        disabled={isDisabled}
        className={cn(
          "p-2 text-sm rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
          isSelected && "bg-primary text-primary-foreground hover:bg-primary",
          isDisabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {day}
      </button>
    )
  }

  return (
    <div className={cn("p-3", className)}>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 hover:bg-accent rounded-md"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-medium">
          {monthNames[month.getMonth()]} {month.getFullYear()}
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 hover:bg-accent rounded-md"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div key={day} className="p-2 text-sm font-medium text-center">
            {day}
          </div>
        ))}
        {days}
      </div>
    </div>
  )
}

export { Calendar }
