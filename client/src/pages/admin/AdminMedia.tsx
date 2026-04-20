import { useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Trash2, Upload, ImageIcon, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

function formatBytes(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function toClipboardUrl(previewUrl: string): string {
  if (previewUrl.startsWith("http")) return previewUrl;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const path = previewUrl.startsWith("/") ? previewUrl : `/${previewUrl}`;
  return `${base}${path}`;
}

export default function AdminMedia() {
  const { accessToken, hasPermission } = useAdminAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const [uploading, setUploading] = useState(false);

  const listQuery = trpc.adminMedia.list.useQuery(
    { token: accessToken || "", page, pageSize },
    { enabled: !!accessToken }
  );

  const deleteMutation = trpc.adminMedia.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      listQuery.refetch();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "删除失败"),
  });

  const canView = hasPermission("banner", "view");
  const canEdit = hasPermission("banner", "edit");
  const canDelete = hasPermission("banner", "delete");

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "上传失败");
        return;
      }
      toast.success("上传成功");
      listQuery.refetch();
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(false);
    }
  };

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">图片库</h1>
        <p className="text-muted-foreground">你没有权限访问此页面。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">图片库</h1>
          <p className="text-muted-foreground text-sm">上传并管理素材图片，可复制链接用于 Banner、活动说明等。</p>
        </div>
        {canEdit && (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              上传图片
            </Button>
          </div>
        )}
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(listQuery.data?.items ?? []).map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="aspect-square bg-muted relative">
                  <img
                    src={item.previewUrl}
                    alt={item.originalName || ""}
                    className="w-full h-full object-contain"
                  />
                </div>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-medium truncate" title={item.originalName || undefined}>
                    {item.originalName || item.objectKey.split("/").pop()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(item.byteSize)} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => {
                        const text = toClipboardUrl(item.previewUrl);
                        void navigator.clipboard.writeText(text).then(
                          () => toast.success("链接已复制"),
                          () => toast.error("复制失败")
                        );
                      }}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      复制链接
                    </Button>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-8 text-destructive"
                        onClick={() => {
                          if (confirm("确定删除这张图片？")) {
                            deleteMutation.mutate({ token: accessToken!, id: item.id });
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {total === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
              <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
              <p>暂无图片，点击「上传图片」添加。</p>
            </div>
          )}

          {total > pageSize && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}（共 {total} 张）
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
