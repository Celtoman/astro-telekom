import * as React from "react"
import { cn } from "cn"
import { Tab, TabList, TabPanel, TabPanels, Tabs as AriaTabs } from "react-aria-components"

type TabsProps = Omit<React.ComponentProps<typeof AriaTabs>, "selectedKey" | "defaultSelectedKey" | "onSelectionChange"> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

function Tabs({ value, defaultValue, onValueChange, ...props }: TabsProps) {
  return <AriaTabs data-slot="tabs" selectedKey={value} defaultSelectedKey={defaultValue} onSelectionChange={(key) => onValueChange?.(String(key))} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabList>) {
  return <TabList data-slot="tabs-list" className={cn("inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground", className)} {...props} />
}

function TabsTrigger({ className, value, ...props }: Omit<React.ComponentProps<typeof Tab>, "id"> & { value: string }) {
  return <Tab data-slot="tabs-trigger" id={value} className={cn("inline-flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm", className)} {...props} />
}

function TabsContent({ className, value, ...props }: Omit<React.ComponentProps<typeof TabPanel>, "id"> & { value: string }) {
  return <TabPanel data-slot="tabs-content" id={value} className={cn("mt-4 outline-none", className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabPanels as TabsPanels, TabsTrigger }
