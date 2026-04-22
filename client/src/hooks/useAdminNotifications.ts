import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";

type HasPermission = (module: string, action: "view" | "edit" | "delete") => boolean;

/**
 * Connects to the same-origin Socket.IO server (`path: /ws`) with the admin access token.
 * Listens for `new_deposit` / `new_withdrawal` emitted by the API when players submit orders.
 */
export function useAdminNotifications(opts: {
  accessToken: string | null;
  enabled: boolean;
  hasPermission: HasPermission;
  currentAdminUserId?: number;
  /** e.g. invalidate pending counts query when a live event arrives */
  onRealtimeOrder?: () => void;
  /** e.g. invalidate live-chat counts query when chat event arrives */
  onRealtimeChat?: () => void;
}) {
  const [, setLocation] = useLocation();
  const [connected, setConnected] = useState(false);
  const [unreadOrders, setUnreadOrders] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const permRef = useRef(opts.hasPermission);
  permRef.current = opts.hasPermission;
  const onRealtimeRef = useRef(opts.onRealtimeOrder);
  onRealtimeRef.current = opts.onRealtimeOrder;
  const onRealtimeChatRef = useRef(opts.onRealtimeChat);
  onRealtimeChatRef.current = opts.onRealtimeChat;

  const clearUnread = useCallback(() => {
    setUnreadOrders(0);
    setUnreadChats(0);
  }, []);

  useEffect(() => {
    if (!opts.enabled || !opts.accessToken) {
      setConnected(false);
      return;
    }

    const socket: Socket = io(window.location.origin, {
      path: "/ws",
      auth: { token: opts.accessToken },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    socket.on("new_deposit", (data: { depositId?: number; amount?: number; playerId?: number }) => {
      if (!permRef.current("deposit", "view")) return;
      onRealtimeRef.current?.();
      setUnreadOrders((n) => n + 1);
      const id = data?.depositId ?? "?";
      const amt = typeof data?.amount === "number" ? data.amount.toFixed(2) : "—";
      toast.info(`New deposit #${id}`, {
        description: `Player #${data?.playerId ?? "?"} · $${amt}`,
        action: {
          label: "Open",
          onClick: () => setLocation("/admin/deposits"),
        },
      });
    });

    socket.on("new_withdrawal", (data: { withdrawalId?: number; amount?: number; playerId?: number }) => {
      if (!permRef.current("withdraw", "view")) return;
      onRealtimeRef.current?.();
      setUnreadOrders((n) => n + 1);
      const id = data?.withdrawalId ?? "?";
      const amt = typeof data?.amount === "number" ? data.amount.toFixed(2) : "—";
      toast.info(`New withdrawal #${id}`, {
        description: `Player #${data?.playerId ?? "?"} · $${amt}`,
        action: {
          label: "Open",
          onClick: () => setLocation("/admin/withdrawals"),
        },
      });
    });

    socket.on("chat:new_message", (data: { threadId?: number; senderType?: string; senderAdminId?: number }) => {
      if (!permRef.current("livechat", "view")) return;
      // Only notify admins when PLAYER sends a message.
      // Admin-originated replies should not create popup/badge noise.
      if (data?.senderType !== "player") {
        onRealtimeChatRef.current?.();
        return;
      }
      if (opts.currentAdminUserId && data?.senderAdminId && Number(data.senderAdminId) === Number(opts.currentAdminUserId)) {
        onRealtimeChatRef.current?.();
        return;
      }
      setUnreadChats((n) => n + 1);
      onRealtimeChatRef.current?.();
      toast.info(`New chat message`, {
        description: `Thread #${data?.threadId ?? "?"}`,
        action: {
          label: "Open",
          onClick: () => setLocation("/admin/live-chat"),
        },
      });
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
      setConnected(false);
    };
  }, [opts.enabled, opts.accessToken, opts.currentAdminUserId, setLocation]);

  return { connected, unreadOrders, unreadChats, clearUnread };
}
