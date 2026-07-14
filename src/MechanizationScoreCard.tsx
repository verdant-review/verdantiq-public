import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Gauge, Info } from "lucide-react";

interface Props {
  farmId: string;
}

interface ScoreData {
  score: number;
  band: string;
  total_hp: number;
  hectares: number;
}

const MechanizationScoreCard: React.FC<Props> = ({ farmId }) => {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchScore = async () => {
    setLoading(true);
    const { data: result, error } = await (supabase as any).rpc("get_farm_mechanization_score", {
      _farm_id: farmId,
    });
    if (!error && result) setData(result as ScoreData);
    setLoading(false);
  };

  useEffect(() => {
    if (farmId) fetchScore();
  }, [farmId]);

  const bandColor = (score: number) => {
    if (score < 25) return "bg-amber-100 text-amber-900 border-amber-300";
    if (score < 60) return "bg-blue-100 text-blue-900 border-blue-300";
    return "bg-green-100 text-green-900 border-green-300";
  };

  return (
    <Card className="bg-white shadow-sm">
      <CardHeader className="bg-amber-50 border-b">
        <CardTitle className="text-amber-900 flex items-center justify-between">
          <span className="flex items-center">
            <Gauge className="h-5 w-5 mr-2" />
            Mechanization Score
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  Calculated from operational powered equipment per hectare. Manual and animal-powered
                  tools count for context but score lower. Use it to track mechanization progress —
                  not as a judgement.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Calculating…</p>
        ) : data ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-5xl font-bold text-amber-700">{data.score}</div>
                <div className="text-xs text-muted-foreground">out of 100</div>
              </div>
              <Badge className={bandColor(data.score)}>{data.band}</Badge>
            </div>
            <Progress value={data.score} className="h-3" />
            <div className="grid grid-cols-2 text-sm pt-2 border-t">
              <div>
                <div className="text-muted-foreground">Total HP</div>
                <div className="font-semibold">{Number(data.total_hp).toFixed(1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Hectares</div>
                <div className="font-semibold">{Number(data.hectares).toFixed(1)}</div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Add equipment to see your score.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default MechanizationScoreCard;
