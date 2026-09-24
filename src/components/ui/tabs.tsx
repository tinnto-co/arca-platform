'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] inline-flex w-fit items-center justify-center rounded-lg p-[3px]',
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:shadow-[0_1px_2px_rgba(16,23,32,0.08)] focus-visible:border-[var(--arca-accent)] focus-visible:ring-[var(--arca-accent-ring)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-[5px] text-[12.5px] font-medium whitespace-nowrap transition-all duration-150 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
