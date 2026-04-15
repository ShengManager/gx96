import { useState } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import {
  Gift, Check, Loader2, Sparkles, Clock, Trophy,
  ArrowRight, Percent, DollarSign, Shuffle, Target,
} from "lucide-react";
import { toast } from "sonner";

export default function PlayerBonus() {
  const { accessToken, isAuthenticated } = usePlayerAuth();
  const [selectedBonus, setSelectedBonus] = useState<any>(null);

  const bonusListQuery = trpc.player.bonusList.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );
  const myBonusesQuery = trpc.player.myBonuses.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const claimMutation = trpc.player.claimBonus.useMutation({
    onSuccess: () => {
      bonusListQuery.refetch();
      myBonusesQuery.refetch();
      toast.success("Bonus claimed successfully!");
      setSelectedBonus(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <Gift className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground text-sm mb-4">Login to view exclusive bonuses</p>
        <Link href="/login"><Button className="rounded-full px-8">Login Now</Button></Link>
      </div>
    );
  }

  const bonuses = (bonusListQuery.data as any) || [];
  const myBonuses = (myBonusesQuery.data as any[]) || [];
  const activeBonuses = myBonuses.filter(b => b.status === "active");

  return (
    <div className="space-y-5 pt-4 pb-4">
      <div className="px-4">
        <h2 className="text-xl font-bold">Promotions</h2>
        <p className="text-sm text-muted-foreground">Claim bonuses and track your progress</p>
      </div>

      <Tabs defaultValue="available" className="space-y-4">
        <div className="px-4">
          <TabsList className="w-full">
            <TabsTrigger value="available" className="flex-1">
              <Gift className="w-3.5 h-3.5 mr-1.5" /> Available ({bonuses.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="flex-1">
              <Trophy className="w-3.5 h-3.5 mr-1.5" /> Active ({activeBonuses.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Available Bonuses */}
        <TabsContent value="available" className="px-4 space-y-3">
          {bonusListQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : bonuses.length > 0 ? (
            bonuses.map((bonus: any) => {
              const hasClaimed = bonus.claimedByPlayer?.length > 0;
              return (
                <Card
                  key={bonus.id}
                  className="overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all group active:scale-[0.99]"
                  onClick={() => setSelectedBonus(bonus)}
                >
                  {bonus.cardImageUrl ? (
                    <div className="aspect-[2.5/1] bg-muted relative overflow-hidden">
                      <img src={bonus.cardImageUrl} alt={bonus.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        <h3 className="font-bold text-white text-sm">{bonus.name}</h3>
                      </div>
                      {hasClaimed && (
                        <div className="absolute top-2 right-2">
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-500/90 text-white flex items-center gap-1">
                            <Check className="w-3 h-3" /> Claimed
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-[2.5/1] relative overflow-hidden" style={{
                      background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                    }}>
                      <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/10 -translate-y-6 translate-x-6" />
                      <div className="absolute bottom-0 left-0 w-16 h-16 rounded-full bg-white/5 translate-y-4 -translate-x-4" />
                      <div className="relative z-10 p-4 flex items-center justify-between h-full">
                        <div>
                          <h3 className="font-bold text-white">{bonus.name}</h3>
                          <p className="text-white/70 text-xs mt-1 line-clamp-1">{bonus.description || "Tap for details"}</p>
                        </div>
                        <Gift className="w-10 h-10 text-white/30" />
                      </div>
                      {hasClaimed && (
                        <div className="absolute top-2 right-2">
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-500/90 text-white flex items-center gap-1">
                            <Check className="w-3 h-3" /> Claimed
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <CardContent className="p-3">
                    {!bonus.cardImageUrl && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{bonus.description || "Tap for details"}</p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {bonus.bonusType === 0 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> {parseFloat(bonus.fixedAmount || 0).toFixed(2)}
                        </span>
                      )}
                      {bonus.bonusType === 1 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center gap-1">
                          <Percent className="w-3 h-3" /> {parseFloat(bonus.percentage || 0)}%
                        </span>
                      )}
                      {bonus.bonusType === 2 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center gap-1">
                          <Shuffle className="w-3 h-3" /> Random
                        </span>
                      )}
                      {bonus.rolloverMultiplier && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          x{bonus.rolloverMultiplier} Rollover
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-primary flex items-center gap-0.5">
                        Details <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-16">
              <Gift className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No bonuses available right now</p>
              <p className="text-xs text-muted-foreground mt-1">Check back later for new promotions</p>
            </div>
          )}
        </TabsContent>

        {/* Active Bonuses */}
        <TabsContent value="active" className="px-4 space-y-3">
          {activeBonuses.length > 0 ? (
            activeBonuses.map((pb: any) => {
              const rolloverPct = pb.rolloverRequired
                ? Math.min(100, (parseFloat(pb.currentRollover || 0) / parseFloat(pb.rolloverRequired)) * 100)
                : 0;
              const turnoverPct = pb.turnoverRequired
                ? Math.min(100, (parseFloat(pb.currentTurnover || 0) / parseFloat(pb.turnoverRequired)) * 100)
                : 0;

              return (
                <Card key={pb.id} className="overflow-hidden">
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Bonus #{pb.bonusConfigId}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Amount: MYR {parseFloat(pb.bonusAmount).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                        Active
                      </span>
                    </div>

                    {pb.rolloverRequired && parseFloat(pb.rolloverRequired) > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Target className="w-3 h-3" /> Rollover
                          </span>
                          <span className="font-mono font-medium">
                            {parseFloat(pb.currentRollover || 0).toFixed(0)} / {parseFloat(pb.rolloverRequired).toFixed(0)}
                          </span>
                        </div>
                        <Progress value={rolloverPct} className="h-2" />
                        <p className="text-[10px] text-right text-muted-foreground mt-0.5">{rolloverPct.toFixed(1)}%</p>
                      </div>
                    )}

                    {pb.turnoverRequired && parseFloat(pb.turnoverRequired) > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Target className="w-3 h-3" /> Turnover
                          </span>
                          <span className="font-mono font-medium">
                            {parseFloat(pb.currentTurnover || 0).toFixed(0)} / {parseFloat(pb.turnoverRequired).toFixed(0)}
                          </span>
                        </div>
                        <Progress value={turnoverPct} className="h-2" />
                        <p className="text-[10px] text-right text-muted-foreground mt-0.5">{turnoverPct.toFixed(1)}%</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-16">
              <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No active bonuses</p>
              <p className="text-xs text-muted-foreground mt-1">Claim a bonus from the Available tab</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Bonus Detail Dialog */}
      <Dialog open={!!selectedBonus} onOpenChange={(open) => { if (!open) setSelectedBonus(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-0">
          {selectedBonus?.detailImageUrl ? (
            <img src={selectedBonus.detailImageUrl} alt="" className="w-full aspect-[16/9] object-cover" />
          ) : (
            <div className="w-full aspect-[16/9] relative overflow-hidden" style={{
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
            }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <Gift className="w-16 h-16 text-white/20" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                <h3 className="text-white font-bold text-lg">{selectedBonus?.name}</h3>
              </div>
            </div>
          )}

          <div className="p-5 space-y-4">
            <DialogHeader className="p-0">
              <DialogTitle className="text-lg">{selectedBonus?.name}</DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {selectedBonus?.description || "No description available"}
            </p>

            {/* Bonus Details Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
                <p className="text-sm font-semibold mt-0.5">
                  {selectedBonus?.bonusType === 0 ? "Fixed Amount" : selectedBonus?.bonusType === 1 ? "Percentage" : "Random"}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Value</p>
                <p className="text-sm font-semibold mt-0.5">
                  {selectedBonus?.bonusType === 0 && `MYR ${parseFloat(selectedBonus.fixedAmount || 0).toFixed(2)}`}
                  {selectedBonus?.bonusType === 1 && `${parseFloat(selectedBonus.percentage || 0)}%`}
                  {selectedBonus?.bonusType === 2 && `MYR ${parseFloat(selectedBonus.randomMin || 0).toFixed(2)} - ${parseFloat(selectedBonus.randomMax || 0).toFixed(2)}`}
                </p>
              </div>
              {selectedBonus?.rolloverMultiplier && (
                <div className="p-3 rounded-xl bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rollover</p>
                  <p className="text-sm font-semibold mt-0.5">x{selectedBonus.rolloverMultiplier}</p>
                </div>
              )}
              {selectedBonus?.turnoverTarget && (
                <div className="p-3 rounded-xl bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Turnover</p>
                  <p className="text-sm font-semibold mt-0.5">MYR {parseFloat(selectedBonus.turnoverTarget).toFixed(2)}</p>
                </div>
              )}
              {selectedBonus?.maxWithdraw && (
                <div className="p-3 rounded-xl bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Withdraw</p>
                  <p className="text-sm font-semibold mt-0.5">MYR {parseFloat(selectedBonus.maxWithdraw).toFixed(2)}</p>
                </div>
              )}
              {selectedBonus?.minDeposit && (
                <div className="p-3 rounded-xl bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Min Deposit</p>
                  <p className="text-sm font-semibold mt-0.5">MYR {parseFloat(selectedBonus.minDeposit).toFixed(2)}</p>
                </div>
              )}
            </div>

            {/* Time info */}
            {(selectedBonus?.startDate || selectedBonus?.endDate) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {selectedBonus.startDate && `From ${new Date(selectedBonus.startDate).toLocaleDateString()}`}
                  {selectedBonus.startDate && selectedBonus.endDate && " — "}
                  {selectedBonus.endDate && `Until ${new Date(selectedBonus.endDate).toLocaleDateString()}`}
                </span>
              </div>
            )}

            <Button
              className="w-full h-12 rounded-xl text-base"
              style={{
                background: selectedBonus?.claimedByPlayer?.length > 0
                  ? undefined
                  : "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              }}
              variant={selectedBonus?.claimedByPlayer?.length > 0 ? "secondary" : "default"}
              disabled={selectedBonus?.claimedByPlayer?.length > 0 || claimMutation.isPending}
              onClick={() => claimMutation.mutate({ token: accessToken!, bonusConfigId: selectedBonus.id })}
            >
              {claimMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : selectedBonus?.claimedByPlayer?.length > 0 ? (
                <Check className="w-5 h-5 mr-2" />
              ) : (
                <Sparkles className="w-5 h-5 mr-2" />
              )}
              {selectedBonus?.claimedByPlayer?.length > 0 ? "Already Claimed" : "Claim Bonus"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
