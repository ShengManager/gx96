import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { trpc } from "@/lib/trpc";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

function fmtTime(value: any): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function PlayerChat() {
  const { accessToken, isAuthenticated } = usePlayerAuth();
  const [body, setBody] = useState("");
  const [liveTick, setLiveTick] = useState(0);
  const messagesWrapRef = useRef<HTMLDivElement | null>(null);

  const threadQuery = trpc.player.chat.getOrCreateThread.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken && isAuthenticated }
  );
  const threadId = (threadQuery.data as any)?.thread?.id as number | undefined;

  const messagesQuery = trpc.player.chat.listMessages.useQuery(
    { token: accessToken || "", threadId },
    { enabled: !!accessToken && !!threadId }
  );

  const markReadMutation = trpc.player.chat.markRead.useMutation();
  const sendMutation = trpc.player.chat.sendMessage.useMutation({
    onSuccess: () => {
      setBody("");
      messagesQuery.refetch();
      threadQuery.refetch();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to send"),
  });

  useEffect(() => {
    if (!threadId || !accessToken) return;
    markReadMutation.mutate({ token: accessToken, threadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const socket: Socket = io(window.location.origin, {
      path: "/ws",
      auth: { token: accessToken },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    const onEvent = (payload: any) => {
      if (threadId && payload?.threadId && payload.threadId !== threadId) return;
      setLiveTick((n) => n + 1);
      void messagesQuery.refetch();
      void threadQuery.refetch();
    };
    socket.on("chat:new_message", onEvent);
    socket.on("chat:thread_updated", onEvent);
    return () => {
      socket.off("chat:new_message", onEvent);
      socket.off("chat:thread_updated", onEvent);
      socket.disconnect();
    };
  }, [accessToken, threadId, messagesQuery, threadQuery]);

  const thread = (messagesQuery.data as any)?.thread || (threadQuery.data as any)?.thread || null;
  const messages = ((messagesQuery.data as any)?.messages || []) as any[];
  const isFinished = String(thread?.status || "") === "finished";
  const canSend = !!accessToken && body.trim().length > 0 && !sendMutation.isPending;

  const headerStatus = useMemo(() => {
    if (!thread) return "Open";
    if (thread.status === "finished") return "Finished";
    if (thread.status === "handling") return "Handling";
    return "Open";
  }, [thread]);

  useEffect(() => {
    const el = messagesWrapRef.current;
    if (!el) return;
    // Always stick to latest message on entry/update.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, liveTick, threadId]);

  return (
    <div className="px-4 py-4">
      <Card className="border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-4 h-4" />
            Live Support Chat
            <span className="ml-auto text-xs font-medium text-muted-foreground">
              {headerStatus}
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            This conversation is kept for about 24 hours after support marks it as finished, then it is deleted automatically. Unfinished conversations are not auto-deleted.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div ref={messagesWrapRef} className="h-[48vh] overflow-y-auto rounded-md border border-white/10 p-3">
            {threadQuery.isLoading || messagesQuery.isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No messages yet. Send your first message to start.
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((m: any) => {
                  const isMine = m.senderType === "player";
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        isMine ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className={`mt-1 text-[10px] ${isMine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {fmtTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {isFinished && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              This conversation is marked as finished. You can still send a new message to reopen it.
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSend) {
                  e.preventDefault();
                  sendMutation.mutate({ token: accessToken || "", body: body.trim() });
                }
              }}
            />
            <Button
              disabled={!canSend}
              onClick={() => sendMutation.mutate({ token: accessToken || "", body: body.trim() })}
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
      <span className="hidden">{liveTick}</span>
    </div>
  );
}
