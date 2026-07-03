"use client";

import { Bell, CaretRight, Circle } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getUnreadNotificationCountAction } from "@/modules/notifications/actions/get-notification-count.action";
import { getNotificationsAction } from "@/modules/notifications/actions/get-notifications.action";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/notifications/actions/mark-read.action";
import type { Notification } from "@/modules/notifications/types";

type NotificationBellProps = {
  orgSlug: string;
};

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: string) => void;
}) {
  const router = useRouter();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (notification.is_read) {
      return;
    }
    hoverTimerRef.current = setTimeout(() => {
      onRead(notification.id);
    }, 50);
  }, [notification.id, notification.is_read, onRead]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (notification.link) {
      router.push(notification.link);
    }
  }, [notification.link, router]);

  const timeAgo = getTimeAgo(notification.created_at);

  return (
    <button
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      type="button"
    >
      {!notification.is_read && (
        <Circle className="mt-0.5 h-2.5 w-2.5 shrink-0 fill-blue-500 text-blue-500" />
      )}
      {notification.is_read && <span className="w-2.5 shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`font-medium text-sm ${notification.is_read ? "" : "font-semibold"}`}
          >
            {notification.title}
          </span>
          <CaretRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        </div>
        <p className="line-clamp-2 text-muted-foreground text-xs">
          {notification.body}
        </p>
        <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
      </div>
    </button>
  );
}

export function NotificationBell({ orgSlug }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ["unread-notification-count", orgSlug],
    queryFn: () => getUnreadNotificationCountAction(orgSlug),
    refetchInterval: 30_000,
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", orgSlug],
    queryFn: () => getNotificationsAction(orgSlug),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (open) {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({
          queryKey: ["unread-notification-count", orgSlug],
        });
        queryClient.invalidateQueries({
          queryKey: ["notifications", orgSlug],
        });
      }, 30_000);

      return () => clearInterval(interval);
    }
  }, [open, orgSlug, queryClient]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllNotificationsReadAction(orgSlug);
    queryClient.invalidateQueries({
      queryKey: ["unread-notification-count", orgSlug],
    });
    queryClient.invalidateQueries({
      queryKey: ["notifications", orgSlug],
    });
  }, [orgSlug, queryClient]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await markNotificationReadAction(id);
      } catch {
        // Silently ignore if marking as read fails
      }
      queryClient.invalidateQueries({
        queryKey: ["unread-notification-count", orgSlug],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications", orgSlug],
      });
    },
    [orgSlug, queryClient]
  );

  const displayCount = count > 9 ? "+9" : String(count);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Notificaciones"
          className="relative h-9 w-9"
          size="icon"
          variant="ghost"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <Badge
              className="-right-1 -top-1 absolute flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] leading-none"
              variant="destructive"
            >
              {displayCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0"
        side="right"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold text-sm">Notificaciones</span>
          {count > 0 && (
            <Button
              className="h-auto px-2 py-1 text-xs"
              onClick={handleMarkAllRead}
              size="sm"
              variant="ghost"
            >
              Marcar todas leídas
            </Button>
          )}
        </div>
        <Separator />
        {isLoading && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!isLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              No hay notificaciones
            </p>
          </div>
        )}
        {!isLoading && notifications.length > 0 && (
          <ScrollArea className="max-h-80">
            {notifications.map((n) => (
              <div key={n.id}>
                <NotificationItem notification={n} onRead={handleMarkRead} />
                <Separator />
              </div>
            ))}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return "Ahora";
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `hace ${diffMin} min`;
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return `hace ${diffHr}h`;
  }
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) {
    return `hace ${diffDay}d`;
  }
  return dateStr.slice(0, 10);
}
