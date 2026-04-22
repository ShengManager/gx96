import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageUrlField } from "@/components/admin/ImageUrlField";
import { Plus, Edit, Trash2, Image } from "lucide-react";
import { toast } from "sonner";

export default function AdminBanners() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const bannersQuery = trpc.adminBanners.list.useQuery({ token: accessToken || "" }, { enabled: !!accessToken });
  const createMutation = trpc.adminBanners.create.useMutation({
    onSuccess: () => { bannersQuery.refetch(); setShowForm(false); toast.success("Banner created"); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.adminBanners.update.useMutation({
    onSuccess: () => { bannersQuery.refetch(); setEditing(null); toast.success("Banner updated"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.adminBanners.delete.useMutation({
    onSuccess: () => { bannersQuery.refetch(); toast.success("Banner deleted"); },
    onError: (err: any) => toast.error(err.message),
  });

  const canEdit = hasPermission("banner", "edit");
  const canDelete = hasPermission("banner", "delete");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banner Management</h1>
          <p className="text-muted-foreground">Manage frontend carousel banners</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-2" /> Add Banner</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(bannersQuery.data as any[])?.map((banner: any) => (
          <Card key={banner.id} className="overflow-hidden">
            <div className="aspect-[16/6] bg-muted relative">
              {banner.imageUrl ? (
                <img src={banner.imageUrl} alt={banner.title || "Banner"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Image className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute top-2 right-2 flex gap-1">
                <span className={`status-badge ${banner.isActive ? "status-approved" : "status-rejected"}`}>
                  {banner.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <CardContent className="pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{banner.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">Order: {banner.sortOrder}</p>
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => setEditing(banner)}><Edit className="w-4 h-4" /></Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (confirm("Delete?")) deleteMutation.mutate({ token: accessToken!, bannerId: banner.id });
                    }}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <BannerFormDialog open={showForm} onOpenChange={setShowForm} title="Add Banner"
        onSubmit={(d) => createMutation.mutate({ token: accessToken!, ...d })} accessToken={accessToken!} />
      {editing && (
        <BannerFormDialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} title="Edit Banner" initialData={editing}
          onSubmit={(d) => updateMutation.mutate({ token: accessToken!, bannerId: editing.id, ...d })} accessToken={accessToken!} />
      )}
    </div>
  );
}

function BannerFormDialog({ open, onOpenChange, onSubmit, title, initialData, accessToken }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; title: string; initialData?: any; accessToken: string;
}) {
  const [form, setForm] = useState({
    title: initialData?.title || "",
    imageUrl: initialData?.imageUrl || "",
    linkUrl: initialData?.linkUrl || "",
    sortOrder: initialData?.sortOrder ?? 0,
    isActive: initialData?.isActive ?? true,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="space-y-2">
            <Label>Image URL</Label>
            <ImageUrlField
              accessToken={accessToken}
              value={form.imageUrl}
              onChange={(next) => setForm((f) => ({ ...f, imageUrl: next }))}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2"><Label>Link URL (optional)</Label><Input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} /></div>
            <div className="flex items-center gap-2 pt-6"><Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} /><Label>Active</Label></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!form.imageUrl} onClick={() => onSubmit(form)}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
