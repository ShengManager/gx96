import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageUrlField } from "@/components/admin/ImageUrlField";
import { Palette, Save } from "lucide-react";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { css as cssLang } from "@codemirror/lang-css";
import { html as htmlLang } from "@codemirror/lang-html";
import { javascript as jsLang } from "@codemirror/lang-javascript";
import { json as jsonLang } from "@codemirror/lang-json";

type LayoutCode = { css?: string; headHtml?: string; bodyHtml?: string; bodyJs?: string; dataJson?: string };
type GameLayoutMode = "top_tabs" | "left_sidebar";

type EditorLang = "css" | "html" | "javascript" | "json";

function editorExtensions(lang: EditorLang) {
  if (lang === "css") return [cssLang()];
  if (lang === "html") return [htmlLang()];
  if (lang === "json") return [jsonLang()];
  return [jsLang({ jsx: true })];
}

function CodeEditorField({
  value,
  onChange,
  lang,
  disabled,
  minHeight = "140px",
}: {
  value: string;
  onChange: (next: string) => void;
  lang: EditorLang;
  disabled: boolean;
  minHeight?: string;
}) {
  return (
    <div className="rounded-md border border-input overflow-hidden">
      <CodeMirror
        value={value}
        onChange={(v) => onChange(v)}
        theme={oneDark}
        editable={!disabled}
        extensions={editorExtensions(lang)}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          indentOnInput: true,
          autocompletion: true,
        }}
        style={{ minHeight }}
      />
    </div>
  );
}

const LAYOUT_KEYS = [
  { key: "global", label: "Global" },
  { key: "home", label: "Home" },
  { key: "game", label: "Game" },
  { key: "deposit", label: "Deposit" },
  { key: "withdraw", label: "Withdraw" },
  { key: "bonus", label: "Bonus" },
  { key: "profile", label: "Profile" },
  { key: "history", label: "History" },
] as const;

function emptyLayoutCode(): LayoutCode {
  return { css: "", headHtml: "", bodyHtml: "", bodyJs: "", dataJson: "" };
}

export default function AdminLayouts() {
  const { accessToken, hasPermission } = useAdminAuth();
  const canEdit = hasPermission("setting", "edit");

  const settingsQuery = trpc.adminFrontend.get.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );
  const saveMutation = trpc.adminFrontend.save.useMutation({
    onSuccess: () => {
      settingsQuery.refetch();
      toast.success("Layout settings saved");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    templateId: "default",
    primaryColor: "",
    siteName: "",
    logoUrl: "",
    faviconUrl: "",
    footerText: "",
    customCss: "",
    customHeadHtml: "",
    customBodyJs: "",
    layoutInjections: {} as Record<string, LayoutCode>,
  });
  const [gameLayoutMode, setGameLayoutMode] = useState<GameLayoutMode>("top_tabs");

  useEffect(() => {
    const d = settingsQuery.data as any;
    if (!d) return;
    const rawInjections = (d.layoutInjections || {}) as Record<string, LayoutCode>;
    const normalizedInjections: Record<string, LayoutCode> = {
      ...rawInjections,
    };
    // Backward compatibility: old key "games" -> new key "game"
    if (!normalizedInjections.game && normalizedInjections.games) {
      normalizedInjections.game = normalizedInjections.games;
    }
    setForm({
      templateId: d.templateId || "default",
      primaryColor: d.primaryColor || "",
      siteName: d.siteName || "",
      logoUrl: d.logoUrl || "",
      faviconUrl: d.faviconUrl || "",
      footerText: d.footerText || "",
      customCss: d.customCss || "",
      customHeadHtml: d.customHeadHtml || "",
      customBodyJs: d.customBodyJs || "",
      layoutInjections: normalizedInjections,
    });
    const gameCfgRaw = String((normalizedInjections.game?.dataJson || "").trim());
    if (gameCfgRaw) {
      try {
        const cfg = JSON.parse(gameCfgRaw);
        const mode = String(cfg.providerLayoutMode || "").trim();
        setGameLayoutMode(mode === "left_sidebar" ? "left_sidebar" : "top_tabs");
      } catch {
        setGameLayoutMode("top_tabs");
      }
    } else {
      setGameLayoutMode("top_tabs");
    }
  }, [settingsQuery.data]);

  const activeLayouts = useMemo(() => {
    const map: Record<string, LayoutCode> = {};
    for (const item of LAYOUT_KEYS) {
      map[item.key] = {
        ...emptyLayoutCode(),
        ...(form.layoutInjections[item.key] || {}),
      };
    }
    return map;
  }, [form.layoutInjections]);

  const setLayoutCode = (layoutKey: string, patch: Partial<LayoutCode>) => {
    if (layoutKey === "game" && typeof patch.dataJson === "string") {
      const raw = patch.dataJson.trim();
      if (!raw) {
        setGameLayoutMode("top_tabs");
      } else {
        try {
          const parsed = JSON.parse(raw);
          const mode = String(parsed?.providerLayoutMode || "").trim();
          setGameLayoutMode(mode === "left_sidebar" ? "left_sidebar" : "top_tabs");
        } catch {
          // Keep current visual selection while JSON is temporarily invalid during editing.
        }
      }
    }
    setForm((prev) => ({
      ...prev,
      layoutInjections: {
        ...prev.layoutInjections,
        [layoutKey]: {
          ...emptyLayoutCode(),
          ...(prev.layoutInjections[layoutKey] || {}),
          ...patch,
        },
      },
    }));
  };

  const setGameLayoutModeAndPersistDataJson = (mode: GameLayoutMode) => {
    setGameLayoutMode(mode);
    setForm((prev) => {
      const current = prev.layoutInjections.game || {};
      let cfg: any = {};
      const raw = String(current.dataJson || "").trim();
      if (raw) {
        try {
          cfg = JSON.parse(raw);
        } catch {
          cfg = {};
        }
      }
      cfg.providerLayoutMode = mode;
      cfg.providerAsPrimary = true;
      return {
        ...prev,
        layoutInjections: {
          ...prev.layoutInjections,
          game: {
            ...emptyLayoutCode(),
            ...current,
            dataJson: JSON.stringify(cfg, null, 2),
          },
        },
      };
    });
  };

  if (settingsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">Loading layout settings...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Layouts</h1>
        <p className="text-muted-foreground">Manage player frontend branding and page-level custom injections</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5" /> Branding</CardTitle>
          <CardDescription>Player-facing site identity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Site Name</Label>
              <Input
                value={form.siteName}
                onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
                placeholder="My Gaming Platform"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.primaryColor || "#6366f1"}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="w-12 h-10 p-1"
                  disabled={!canEdit}
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  placeholder="#6366f1"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <ImageUrlField
                accessToken={accessToken || ""}
                value={form.logoUrl}
                onChange={(next) => setForm((f) => ({ ...f, logoUrl: next }))}
                placeholder="https://..."
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Favicon URL</Label>
              <ImageUrlField
                accessToken={accessToken || ""}
                value={form.faviconUrl}
                onChange={(next) => setForm((f) => ({ ...f, faviconUrl: next }))}
                placeholder="https://..."
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Footer Text</Label>
            <Input
              value={form.footerText}
              onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
              placeholder="© 2026 My Platform"
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Code Injection</CardTitle>
          <CardDescription>
            Configure custom CSS / HEAD HTML / BODY HTML / BODY JS per layout page plus global
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-white/10 p-3 space-y-3 mb-4">
            <div>
              <Label>Company Category Layout (`/games`)</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Choose how provider/company categories are displayed on the games page.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setGameLayoutModeAndPersistDataJson("top_tabs")}
                className={`text-left rounded-md border p-3 transition ${
                  gameLayoutMode === "top_tabs"
                    ? "border-primary bg-primary/10"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                <div className="font-medium text-sm">Top Company Tabs</div>
                <div className="text-xs text-muted-foreground mt-1">Top row = companies, below = game grid.</div>
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setGameLayoutModeAndPersistDataJson("left_sidebar")}
                className={`text-left rounded-md border p-3 transition ${
                  gameLayoutMode === "left_sidebar"
                    ? "border-primary bg-primary/10"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                <div className="font-medium text-sm">Left Company Sidebar</div>
                <div className="text-xs text-muted-foreground mt-1">Left side = company list, right side = game grid.</div>
              </button>
            </div>
          </div>
          <Tabs defaultValue="global" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              {LAYOUT_KEYS.map((item) => (
                <TabsTrigger key={item.key} value={item.key}>{item.label}</TabsTrigger>
              ))}
            </TabsList>
            {LAYOUT_KEYS.map((item) => {
              const code = activeLayouts[item.key];
              return (
                <TabsContent key={item.key} value={item.key} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{item.label} CSS</Label>
                    <CodeEditorField
                      value={code.css || ""}
                      onChange={(next) => setLayoutCode(item.key, { css: next })}
                      lang="css"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{item.label} HEAD HTML</Label>
                    <CodeEditorField
                      value={code.headHtml || ""}
                      onChange={(next) => setLayoutCode(item.key, { headHtml: next })}
                      lang="html"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{item.label} BODY JS</Label>
                    <CodeEditorField
                      value={code.bodyJs || ""}
                      onChange={(next) => setLayoutCode(item.key, { bodyJs: next })}
                      lang="javascript"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{item.label} BODY HTML</Label>
                    <CodeEditorField
                      value={code.bodyHtml || ""}
                      onChange={(next) => setLayoutCode(item.key, { bodyHtml: next })}
                      lang="html"
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-muted-foreground">
                      BODY HTML will render at page bottom, above footer text.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{item.label} Data JSON (Optional)</Label>
                    <CodeEditorField
                      value={code.dataJson || ""}
                      onChange={(next) => setLayoutCode(item.key, { dataJson: next })}
                      lang="json"
                      minHeight="180px"
                      disabled={!canEdit}
                    />
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              const next = { ...form.layoutInjections };
              if (!next.game && (next as any).games) {
                next.game = (next as any).games;
              }
              delete (next as any).games;
              saveMutation.mutate({ token: accessToken!, ...form, layoutInjections: next });
            }}
            disabled={saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" /> Save Layouts
          </Button>
        </div>
      )}
    </div>
  );
}

