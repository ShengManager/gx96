import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Search } from "lucide-react";

type Props = {
  accessToken: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

function toAbsoluteUrl(previewUrl: string): string {
  if (!previewUrl) return "";
  if (previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) return previewUrl;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${previewUrl.startsWith("/") ? previewUrl : `/${previewUrl}`}`;
}

function preferFrontendUrl(item: any, frontendBaseUrl: string): string {
  const direct = String(item?.frontendPreviewUrl || "").trim();
  if (direct) return toAbsoluteUrl(direct);
  const path = String(item?.previewPath || item?.previewUrl || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (frontendBaseUrl) {
    return `${frontendBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return toAbsoluteUrl(path);
}

export function ImageUrlField({
  accessToken,
  value,
  onChange,
  placeholder = "https://...",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const [keyword, setKeyword] = useState("");
  const [fileType, setFileType] = useState<"all" | "png" | "jpg" | "webp" | "gif" | "other">("all");
  const [sortBy, setSortBy] = useState<
    "createdAt_desc" | "createdAt_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc"
  >("createdAt_desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const mediaQuery = trpc.adminMedia.list.useQuery(
    {
      token: accessToken || "",
      page,
      pageSize,
      keyword: keyword.trim() || undefined,
      fileType,
      sortBy,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    { enabled: open && !!accessToken }
  );

  const total = mediaQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = useMemo(() => mediaQuery.data?.items ?? [], [mediaQuery.data]);
  const frontendBaseUrl = String((mediaQuery.data as any)?.frontendBaseUrl || "").trim();

  const formatBytes = (n?: number | null) => {
    if (!n || n <= 0) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const clearFilters = () => {
    setKeyword("");
    setFileType("all");
    setSortBy("createdAt_desc");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          选择图片
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen} >
        <DialogContent className="max-w-4xl" style={{ width: "98vw", maxWidth: "1200px" }}>
          <DialogHeader>
            <DialogTitle>选择图片</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-white/10 bg-muted/20 p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">关键字</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={keyword}
                      onChange={(e) => {
                        setKeyword(e.target.value);
                        setPage(1);
                      }}
                      placeholder="文件名 / object key"
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">格式</Label>
                  <Select value={fileType} onValueChange={(v: any) => { setFileType(v); setPage(1); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="jpg">JPG/JPEG</SelectItem>
                      <SelectItem value="webp">WEBP</SelectItem>
                      <SelectItem value="gif">GIF</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">日期从</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">日期至</Label>
                  <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
                </div>
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1 w-full md:w-64">
                  <Label className="text-xs">排序</Label>
                  <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); setPage(1); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="createdAt_desc">最新上传</SelectItem>
                      <SelectItem value="createdAt_asc">最早上传</SelectItem>
                      <SelectItem value="name_asc">名称 A-Z</SelectItem>
                      <SelectItem value="name_desc">名称 Z-A</SelectItem>
                      <SelectItem value="size_desc">大小（大→小）</SelectItem>
                      <SelectItem value="size_asc">大小（小→大）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-muted-foreground">
                  共 {total} 张，当前第 {page}/{totalPages} 页
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  清除筛选
                </Button>
              </div>
            </div>

            {mediaQuery.isLoading ? (
              <div className="text-sm text-muted-foreground py-10 text-center">加载中...</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">
                图片库没有素材，请先到 Admin Media 上传。
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[52vh] overflow-y-auto pr-1">
                {items.map((item) => {
                  const url = toAbsoluteUrl(item.previewUrl);
                  const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString() : "—";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-lg border border-white/10 bg-card/70 overflow-hidden text-left hover:border-primary/60 hover:shadow-md transition"
                      onClick={() => {
                        onChange(preferFrontendUrl(item, frontendBaseUrl));
                        setOpen(false);
                      }}
                    >
                      <div className="aspect-square bg-muted/60">
                        <img src={url} alt={item.originalName || ""} className="w-full h-full object-contain" />
                      </div>
                      <div className="px-2 py-2 space-y-1">
                        <div className="text-[12px] font-medium truncate">
                          {item.originalName || "Untitled"}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {(item.contentType || "unknown").toLowerCase()}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                          <span>{formatBytes(item.byteSize)}</span>
                          <span className="truncate ml-2">{createdAt}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {total > pageSize && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

