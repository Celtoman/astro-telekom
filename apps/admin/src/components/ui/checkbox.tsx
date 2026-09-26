import * as React from "react"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"
import { CheckboxButton, CheckboxField } from "react-aria-components"

type CheckboxProps = Omit<React.ComponentProps<typeof CheckboxField>, "isSelected" | "isDisabled" | "onChange" | "className" | "children"> & {
  checked?: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
  children?: React.ReactNode
}

function Checkbox({ className, checked, disabled, onCheckedChange, children, ...props }: CheckboxProps) {
  return (
    <CheckboxField
      data-slot="checkbox"
      className={cn("group/checkbox inline-flex text-sm data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50", className)}
      isSelected={checked}
      isDisabled={disabled}
      onChange={onCheckedChange}
      {...props}
    >
      <CheckboxButton className="inline-flex cursor-pointer items-center gap-2 rounded-sm outline-none data-[focus-visible]:ring-3 data-[focus-visible]:ring-ring/50 group-data-[disabled]/checkbox:cursor-not-allowed">
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center rounded-[4px] border border-input transition-colors group-data-[selected]/checkbox:border-primary group-data-[selected]/checkbox:bg-primary group-data-[selected]/checkbox:text-primary-foreground">
          <CheckIcon className="size-3.5 opacity-0 group-data-[selected]/checkbox:opacity-100" />
        </span>
        {children}
      </CheckboxButton>
    </CheckboxField>
  )
}

export { Checkbox }
