import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Edit, Gift, GripVertical, Layers, Trash2 } from "lucide-react";

const BONUS_TYPES = ["Fixed Amount", "Percentage", "Random Range"];

const G_PREFIX = "grp::";
const B_PREFIX = "bon::";

function gid(key: string) {
  return `${G_PREFIX}${key}`;
}
function bid(id: number) {
  return `${B_PREFIX}${id}`;
}
function parseG(s: string): string | null {
  return s.startsWith(G_PREFIX) ? s.slice(G_PREFIX.length) : null;
}
function parseB(s: string): number | null {
  return s.startsWith(B_PREFIX) ? Number(s.slice(B_PREFIX.length)) : null;
}

function findBonusContainer(
  bonusId: number,
  items: Record<string, number[]>,
  order: string[]
): string | undefined {
  for (const k of order) {
    if (items[k]?.includes(bonusId)) return k;
  }
  return undefined;
}

function pruneEmptyGroups(
  order: string[],
  items: Record<string, number[]>,
  preserveKeys?: Set<string>
): string[] {
  return order.filter(
    (k) => (items[k]?.length || 0) > 0 || (preserveKeys?.has(k) ?? false)
  );
}

export type BonusLayoutGroup = {
  key: string;
  items: any[];
  title: string | null;
  bannerUrl: string | null;
  groupSort: number;
};

type Props = {
  groups: BonusLayoutGroup[];
  /** Group keys that exist in DB: keep empty groups in the list */
  preserveEmptyGroupKeys?: Set<string>;
  accessToken: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (bonus: any) => void;
  onDelete: (bonusId: number) => void;
  onEditGroup: (key: string) => void;
  onApplyLayout: (groups: { key: string; bonusIds: number[] }[]) => Promise<void>;
  dataUpdatedAt: number;
};

export function AdminBonusDraggableList({
  groups,
  preserveEmptyGroupKeys,
  accessToken,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onEditGroup,
  onApplyLayout,
  dataUpdatedAt,
}: Props) {
  const [containerOrder, setContainerOrder] = useState<string[]>([]);
  const [items, setItems] = useState<Record<string, number[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const order = groups.map((g) => g.key);
    const map: Record<string, number[]> = {};
    for (const g of groups) {
      map[g.key] = g.items.map((x: any) => x.id);
    }
    setContainerOrder(order);
    setItems(map);
  }, [groups, dataUpdatedAt]);

  const lookup = useMemo(() => {
    const m = new Map<number, any>();
    for (const g of groups) {
      for (const b of g.items) m.set(b.id, b);
    }
    return m;
  }, [groups]);

  const flush = useCallback(
    async (nextOrder: string[], nextItems: Record<string, number[]>) => {
      const prunedOrder = pruneEmptyGroups(nextOrder, nextItems, preserveEmptyGroupKeys);
      setContainerOrder(prunedOrder);
      const cleaned: Record<string, number[]> = {};
      for (const k of prunedOrder) {
        cleaned[k] = [...(nextItems[k] || [])];
      }
      setItems(cleaned);

      const payload = prunedOrder.map((key) => ({
        key,
        bonusIds: [...(cleaned[key] || [])],
      }));

      const flat = payload.flatMap((g) => g.bonusIds);
      if (flat.length !== new Set(flat).size) return;

      if (!accessToken) return;
      setSaving(true);
      try {
        await onApplyLayout(payload);
      } finally {
        setSaving(false);
      }
    },
    [accessToken, onApplyLayout, preserveEmptyGroupKeys]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !canEdit) return;
    if (String(active.id) === String(over.id)) return;

    const gActive = parseG(String(active.id));
    const gOver = parseG(String(over.id));
    if (gActive && gOver) {
      const oldI = containerOrder.indexOf(gActive);
      const newI = containerOrder.indexOf(gOver);
      if (oldI < 0 || newI < 0 || oldI === newI) return;
      const nextOrder = arrayMove(containerOrder, oldI, newI);
      void flush(nextOrder, { ...items });
      return;
    }

    const bActive = parseB(String(active.id));
    if (bActive == null) return;

    const source = findBonusContainer(bActive, items, containerOrder);
    if (!source) return;

    let overB = parseB(String(over.id));
    let target = overB != null ? findBonusContainer(overB, items, containerOrder) : undefined;
    if (!target) {
      const gh = parseG(String(over.id));
      if (gh) target = gh;
    }
    if (!target) return;

    if (source === target) {
      const list = [...(items[source] || [])];
      const oldI = list.indexOf(bActive);
      const newI = overB != null ? list.indexOf(overB) : list.length - 1;
      if (oldI < 0 || newI < 0) return;
      const nextItems = {
        ...items,
        [source]: arrayMove(list, oldI, newI),
      };
      void flush(containerOrder, nextItems);
      return;
    }

    const src = [...(items[source] || [])];
    const tgt = [...(items[target] || [])];
    const fromI = src.indexOf(bActive);
    if (fromI < 0) return;
    src.splice(fromI, 1);

    let insertI: number;
    if (overB != null && tgt.includes(overB)) {
      insertI = tgt.indexOf(overB);
    } else {
      insertI = tgt.length;
    }
    tgt.splice(insertI, 0, bActive);

    let nextOrder = [...containerOrder];
    if (!nextOrder.includes(target)) {
      const si = nextOrder.indexOf(source);
      nextOrder = [...nextOrder.slice(0, si + 1), target, ...nextOrder.slice(si + 1)].filter(
        (k, i, a) => a.indexOf(k) === i
      );
    }

    const nextItems = { ...items, [source]: src, [target]: tgt };
    void flush(nextOrder, nextItems);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {saving && <p className="text-xs text-muted-foreground">Saving order…</p>}
        <SortableContext id="bonus-groups" items={containerOrder.map(gid)} strategy={verticalListSortingStrategy}>
          {containerOrder.map((groupKey) => (
            <SortableGroupSection
              key={groupKey}
              groupKey={groupKey}
              bonusIds={items[groupKey] || []}
              lookup={lookup}
              title={groups.find((g) => g.key === groupKey)?.title ?? null}
              bannerUrl={groups.find((g) => g.key === groupKey)?.bannerUrl ?? null}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={onEdit}
              onDelete={onDelete}
              onEditGroup={onEditGroup}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}

function SortableGroupSection({
  groupKey,
  bonusIds,
  lookup,
  title,
  bannerUrl,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onEditGroup,
}: {
  groupKey: string;
  bonusIds: number[];
  lookup: Map<number, any>;
  title: string | null;
  bannerUrl: string | null;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (b: any) => void;
  onDelete: (id: number) => void;
  onEditGroup: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: gid(groupKey),
    data: { type: "group" },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  };

  const sortableBonusIds = bonusIds.map((id) => bid(id));

  return (
    <Card ref={setNodeRef} style={style} className="border-white/10 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2.5 bg-muted/50 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {canEdit && (
            <button
              type="button"
              className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded"
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder group"
            >
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          <Layers className="w-4 h-4 text-primary shrink-0" />
          <Badge variant="secondary" className="font-mono text-[10px] max-w-[200px] truncate">
            {groupKey === "__ungrouped__" ? "Ungrouped" : groupKey}
          </Badge>
          {title && <span className="text-sm font-semibold truncate">{title}</span>}
          <span className="text-xs text-muted-foreground">
            {bonusIds.length} {bonusIds.length === 1 ? "promotion" : "promotions"}
          </span>
        </div>
        {canEdit && groupKey !== "__ungrouped__" && (
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onEditGroup(groupKey)}>
            Edit title / banner
          </Button>
        )}
      </div>
      {groupKey !== "__ungrouped__" && bannerUrl && (
        <div className="px-3 pt-2">
          <div className="w-1/2 max-w-[50%] mx-auto">
            <img src={bannerUrl} alt="" className="w-full h-auto max-h-16 object-contain block" />
          </div>
        </div>
      )}
      <CardContent className="p-2 space-y-1">
        <SortableContext id={`bonuses-${groupKey}`} items={sortableBonusIds} strategy={verticalListSortingStrategy}>
          {bonusIds.map((id) => {
            const bonus = lookup.get(id);
            if (!bonus) return null;
            return (
              <SortableBonusRow
                key={id}
                bonus={bonus}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          })}
        </SortableContext>
        {bonusIds.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-3">
            Drag promotions into this group. Empty groups remain until you delete the group.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SortableBonusRow({
  bonus,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  bonus: any;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (b: any) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bid(bonus.id),
    data: { type: "bonus" },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-stretch gap-2 rounded-lg border border-white/10 bg-card/40 px-2 py-2 text-sm"
    >
      {canEdit && (
        <button
          type="button"
          className="touch-none cursor-grab active:cursor-grabbing shrink-0 self-center text-muted-foreground hover:text-foreground p-1"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder or move to another group"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <Gift className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{bonus.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{bonus.description || "—"}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
          <span className={`status-badge ${bonus.isActive ? "status-approved" : "status-rejected"}`}>
            {bonus.isActive ? "Active" : "Inactive"}
          </span>
          <Badge variant="outline">{BONUS_TYPES[bonus.bonusType] || "?"}</Badge>
          <span className="font-mono text-muted-foreground">
            {bonus.bonusType === 0 && `$${parseFloat(bonus.fixedAmount || "0").toFixed(2)}`}
            {bonus.bonusType === 1 && `${parseFloat(bonus.percentage || "0").toFixed(1)}%`}
            {bonus.bonusType === 2 &&
              `$${parseFloat(bonus.randomMin || "0").toFixed(2)} - $${parseFloat(bonus.randomMax || "0").toFixed(2)}`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {canEdit && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(bonus)}>
            <Edit className="w-4 h-4" />
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              if (confirm("Delete this bonus?")) onDelete(bonus.id);
            }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}
