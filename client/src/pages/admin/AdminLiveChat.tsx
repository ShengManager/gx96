import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function formatDateTime(v: any): string {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function handledName(thread: any): string {
  const display = String(thread?.handledByDisplayName || "").trim();
  const username = String(thread?.handledByUsername || "").trim();
  if (display) return display;
  if (username) return username;
  const id = Number(thread?.handledBy || 0);
  return id > 0 ? `admin #${id}` : "unknown";
}

export default function AdminLiveChat() {
  const { user, accessToken, hasPermission } = useAdminAuth();
  const [location] = useLocation();
  const canView = hasPermission("livechat", "view");
  const canEdit = hasPermission("livechat", "edit");
  const utils = trpc.useUtils();

  const [status, setStatus] = useState<"all" | "open" | "handling" | "finished">("all");
  const [assignee, setAssignee] = useState<"all" | "mine" | "unassigned">("all");
  const [keyword, setKeyword] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const preferredThreadId = useMemo(() => {
    try {
      const idx = location.indexOf("?");
      if (idx < 0) return null;
      const qs = location.slice(idx + 1);
      const params = new URLSearchParams(qs);
      const raw = Number(params.get("threadId") || 0);
      return raw > 0 ? raw : null;
    } catch {
      return null;
    }
  }, [location]);

  const listQuery = trpc.adminLiveChat.threads.list.useQuery(
    {
      token: accessToken || "",
      status,
      assignee,
      keyword: keyword.trim() || undefined,
      page: 1,
      pageSize: 50,
    },
    { enabled: !!accessToken && canView, refetchInterval: 20000 }
  );

  const detailQuery = trpc.adminLiveChat.threads.detail.useQuery(
    { token: accessToken || "", threadId: selectedThreadId || 0 },
    { enabled: !!accessToken && !!selectedThreadId && canView, refetchInterval: 20000 }
  );

  const markReadMutation = trpc.adminLiveChat.threads.markRead.useMutation({
    onSuccess: () => {
      void utils.adminLiveChat.counts.invalidate();
      void listQuery.refetch();
    },
  });
  const finishMutation = trpc.adminLiveChat.threads.finish.useMutation({
    onSuccess: () => {
      toast.success("Thread finished");
      void detailQuery.refetch();
      void listQuery.refetch();
      void utils.adminLiveChat.counts.invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to finish"),
  });
  const sendMutation = trpc.adminLiveChat.messages.send.useMutation({
    onSuccess: () => {
      setMessageBody("");
      void detailQuery.refetch();
      void listQuery.refetch();
      void utils.adminLiveChat.counts.invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to send"),
  });

  const threads = ((listQuery.data as any)?.threads || []) as any[];
  const selectedThread = (detailQuery.data as any)?.thread || null;
  const messages = ((detailQuery.data as any)?.messages || []) as any[];

  useEffect(() => {
    if (!selectedThreadId || !selectedThread || !accessToken) return;
    if (Number(selectedThread.unreadForAdmin || 0) <= 0) return;
    markReadMutation.mutate({ token: accessToken, threadId: selectedThreadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, selectedThread?.unreadForAdmin, accessToken]);

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null);
      return;
    }
    if (preferredThreadId && threads.some((t) => t.id === preferredThreadId) && selectedThreadId !== preferredThreadId) {
      setSelectedThreadId(preferredThreadId);
      return;
    }
    if (!selectedThreadId || !threads.some((t) => t.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [threads, selectedThreadId, preferredThreadId]);

  useEffect(() => {
    if (!accessToken || !canView) return;
    const socket: Socket = io(window.location.origin, {
      path: "/ws",
      auth: { token: accessToken },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    const onLiveChat = (payload: any) => {
      if (!payload?.threadId || !selectedThreadId || payload.threadId === selectedThreadId) {
        void detailQuery.refetch();
      }
      void listQuery.refetch();
      void utils.adminLiveChat.counts.invalidate();
    };
    socket.on("chat:new_message", onLiveChat);
    socket.on("chat:thread_updated", onLiveChat);
    return () => {
      socket.off("chat:new_message", onLiveChat);
      socket.off("chat:thread_updated", onLiveChat);
      socket.disconnect();
    };
  }, [accessToken, canView, detailQuery, listQuery, selectedThreadId, utils.adminLiveChat.counts]);

  const handledByCurrentUser = !!selectedThread && !!user && Number(selectedThread.handledBy || 0) === Number(user.id);
  const handledBySomeoneElse = !!selectedThread && Number(selectedThread.handledBy || 0) > 0 && !handledByCurrentUser;
  const canSend = canEdit && !!selectedThread && messageBody.trim().length > 0 && !sendMutation.isPending && selectedThread.status !== "finished" && !handledBySomeoneElse;

  const threadTitle = useMemo(() => {
    if (!selectedThread) return "Conversation";
    return selectedThread.playerFirstName || selectedThread.playerUsername || selectedThread.playerPhone || `Player #${selectedThread.playerId}`;
  }, [selectedThread]);

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">No permission to view live chat.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Live Chat</h1>
        <p className="text-muted-foreground">Handle player real-time conversations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversations</CardTitle>
            <div className="grid grid-cols-2 gap-2">
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="handling">Handling</SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assignee} onValueChange={(v: any) => setAssignee(v)}>
                <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="mine">Mine</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search player..."
            />
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[66vh]">
              {listQuery.isLoading ? (
                <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : threads.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No conversations</div>
              ) : (
                <div className="space-y-2">
                  {threads.map((t) => {
                    const active = t.id === selectedThreadId;
                    const name = t.playerFirstName || t.playerUsername || t.playerPhone || `Player #${t.playerId}`;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedThreadId(t.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                          active ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{name}</div>
                          <Badge variant="secondary">{t.status}</Badge>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="truncate">{t.playerPhone || "-"}</span>
                          <span>{formatDateTime(t.lastMessageAt)}</span>
                        </div>
                        {Number(t.handledBy || 0) > 0 && (
                          <div className="mt-1 text-[11px] text-blue-300">
                            Claimed by {handledName(t)}
                          </div>
                        )}
                        {Number(t.unreadForAdmin || 0) > 0 && (
                          <div className="mt-1 text-[11px] text-amber-400">
                            Unread: {t.unreadForAdmin > 99 ? "99+" : t.unreadForAdmin}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {threadTitle}
              {selectedThread && (
                <span className="ml-auto flex gap-2">
                  <Badge variant="outline">{selectedThread.status}</Badge>
                  {canEdit && selectedThread.status !== "finished" && handledByCurrentUser && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={finishMutation.isPending}
                      onClick={() => finishMutation.mutate({ token: accessToken || "", threadId: selectedThread.id })}
                    >
                      Finish
                    </Button>
                  )}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedThread ? (
              <div className="h-[66vh] flex items-center justify-center text-sm text-muted-foreground">
                Select a conversation
              </div>
            ) : (
              <>
                {handledBySomeoneElse && (
                  <div className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    This conversation has been claimed by {handledName(selectedThread)}. You cannot reply now.
                  </div>
                )}
                {!handledBySomeoneElse && selectedThread.status !== "finished" && (
                  <div className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    {handledByCurrentUser
                      ? `You are handling this conversation (${handledName(selectedThread)}).`
                      : "Unassigned conversation. Sending your first reply will automatically claim it."}
                  </div>
                )}
                <ScrollArea className="h-[56vh] rounded-md border border-white/10 p-3">
                  {detailQuery.isLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No messages yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {messages.map((m: any) => {
                        const isAdmin = m.senderType === "admin";
                        return (
                          <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                              isAdmin ? "bg-primary text-primary-foreground" : "bg-muted"
                            }`}>
                              <div className="whitespace-pre-wrap break-words">{m.body}</div>
                              <div className={`mt-1 text-[10px] ${isAdmin ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                {formatDateTime(m.createdAt)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Finished conversations are deleted automatically after about 24 hours. If the player is still in discussion, do not click Finish.
                </div>
                <div className="flex gap-2">
                  <Input
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder={
                      selectedThread.status === "finished"
                        ? "This thread is finished"
                        : handledBySomeoneElse
                          ? `Claimed by ${handledName(selectedThread)}`
                          : "Type a reply..."
                    }
                    disabled={selectedThread.status === "finished" || handledBySomeoneElse}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSend) {
                        e.preventDefault();
                        sendMutation.mutate({
                          token: accessToken || "",
                          threadId: selectedThread.id,
                          body: messageBody.trim(),
                        });
                      }
                    }}
                  />
                  <Button
                    disabled={!canSend}
                    onClick={() => sendMutation.mutate({
                      token: accessToken || "",
                      threadId: selectedThread.id,
                      body: messageBody.trim(),
                    })}
                  >
                    {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
