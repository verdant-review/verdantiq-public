import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lightbulb,
  Clock,
  TrendingUp,
  ShieldAlert,
  Sprout,
  RefreshCw,
  ArrowRight
} from "lucide-react";

interface ProactiveRecommendationsProps {
  farmId: string;
  crops: { crop_type: string; status: string; planting_date?: string | null; area_hectares: number }[];
  weather?: any;
  region?: string;
}

interface Recommendation {
  id: string;
  type: "action" | "opportunity" | "risk";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  crop?: string;
}

const ProactiveRecommendations: React.FC<ProactiveRecommendationsProps> = ({
  farmId,
  crops,
  weather,
  region
}) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const generateRecommendations = () => {
    const recs: Recommendation[] = [];
    const now = new Date();
    const month = now.getMonth(); // 0-indexed

    // Season-based recommendations for Zimbabwe
    // Oct-Nov: planting season start
    // Dec-Feb: growing season
    // Mar-May: harvest season
    // Jun-Sep: dry season / planning

    crops.forEach((crop) => {
      const cropLower = crop.crop_type.toLowerCase();

      // Planting window alerts
      if (crop.status === "Planning") {
        if (month >= 9 && month <= 10) { // Oct-Nov
          recs.push({
            id: `plant-${crop.crop_type}`,
            type: "action",
            priority: "high",
            title: `Plant ${crop.crop_type} Now`,
            description: `Optimal planting window is open for ${crop.crop_type}. ${crop.area_hectares} hectares planned. Start land preparation immediately.`,
            crop: crop.crop_type
          });
        } else if (month >= 7 && month <= 8) { // Aug-Sep
          recs.push({
            id: `prep-${crop.crop_type}`,
            type: "action",
            priority: "medium",
            title: `Prepare for ${crop.crop_type} Season`,
            description: `Planting season approaching in ${10 - month} months. Order seeds, test soil, and plan fertilizer needs.`,
            crop: crop.crop_type
          });
        }
      }

      // Growing stage recommendations
      if (crop.status === "Growing" && crop.planting_date) {
        const plantDate = new Date(crop.planting_date);
        const daysGrown = Math.floor((now.getTime() - plantDate.getTime()) / (1000 * 60 * 60 * 24));

        if (cropLower.includes("maize") || cropLower.includes("corn")) {
          if (daysGrown >= 21 && daysGrown <= 35) {
            recs.push({
              id: `fert-${crop.crop_type}`,
              type: "action",
              priority: "high",
              title: `Top-dress ${crop.crop_type}`,
              description: `Your maize is ${daysGrown} days old — apply nitrogen top-dressing (AN or Urea) at 6-8 weeks after planting.`,
              crop: crop.crop_type
            });
          }
          if (daysGrown >= 60 && daysGrown <= 80) {
            recs.push({
              id: `scout-${crop.crop_type}`,
              type: "risk",
              priority: "high",
              title: `Scout for Fall Armyworm`,
              description: `Peak armyworm risk period for ${daysGrown}-day old maize. Check whorl and tasseling stages daily.`,
              crop: crop.crop_type
            });
          }
        }

        if (cropLower.includes("soy") || cropLower.includes("soya")) {
          if (daysGrown >= 40 && daysGrown <= 60) {
            recs.push({
              id: `flower-${crop.crop_type}`,
              type: "action",
              priority: "medium",
              title: `Flowering Stage Care`,
              description: `Soybeans entering flowering. Avoid water stress — ensure consistent moisture for pod setting.`,
              crop: crop.crop_type
            });
          }
        }
      }

      // Harvest readiness
      if (crop.status === "Growing" && crop.planting_date) {
        const plantDate = new Date(crop.planting_date);
        const daysGrown = Math.floor((now.getTime() - plantDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (cropLower.includes("maize") && daysGrown >= 120) {
          recs.push({
            id: `harvest-${crop.crop_type}`,
            type: "opportunity",
            priority: "high",
            title: `${crop.crop_type} May Be Ready`,
            description: `At ${daysGrown} days, check grain moisture. Harvest when moisture is below 14% for best storage.`,
            crop: crop.crop_type
          });
        }
      }
    });

    // Weather-based recommendations
    if (weather) {
      if (weather.temperature > 35) {
        recs.push({
          id: "heat-stress",
          type: "risk",
          priority: "high",
          title: "Heat Stress Alert",
          description: `Temperature is ${weather.temperature?.toFixed(0)}°C. Irrigate early morning. Young crops are especially vulnerable.`
        });
      }
      if (weather.rainfall > 30) {
        recs.push({
          id: "waterlog-risk",
          type: "risk",
          priority: "medium",
          title: "Waterlogging Risk",
          description: "Heavy rainfall detected. Check field drainage. Delay any planned chemical applications."
        });
      }
    }

    // Market timing
    if (month >= 2 && month <= 4) {
      const harvestCrops = crops.filter(c => c.status === "Growing" || c.status === "Harvesting");
      if (harvestCrops.length > 0) {
        recs.push({
          id: "market-timing",
          type: "opportunity",
          priority: "medium",
          title: "Check Market Prices",
          description: `Harvest season — compare current market prices before selling. Consider storage if prices are low.`
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    setRecommendations(recs);
    setLoading(false);
  };

  useEffect(() => {
    generateRecommendations();
  }, [crops, weather]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "action": return Sprout;
      case "opportunity": return TrendingUp;
      case "risk": return ShieldAlert;
      default: return Lightbulb;
    }
  };

  const getTypeBadge = (type: string, priority: string) => {
    const colors = {
      action: priority === "high" ? "bg-primary/10 text-primary" : "bg-primary/5 text-primary",
      opportunity: "bg-emerald-50 text-emerald-700",
      risk: priority === "high" ? "bg-destructive/10 text-destructive" : "bg-amber-50 text-amber-700"
    };
    return colors[type as keyof typeof colors] || "bg-muted text-muted-foreground";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Smart Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Smart Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No urgent recommendations right now. Add crop cycles to get personalized advice.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Smart Recommendations
            <Badge variant="secondary" className="text-xs">{recommendations.length}</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={generateRecommendations} className="h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.slice(0, 5).map((rec) => {
          const Icon = getTypeIcon(rec.type);
          return (
            <div
              key={rec.id}
              className={`p-3 rounded-lg border ${getTypeBadge(rec.type, rec.priority)}`}
            >
              <div className="flex items-start gap-2">
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{rec.title}</span>
                    {rec.crop && (
                      <Badge variant="outline" className="text-xs">{rec.crop}</Badge>
                    )}
                  </div>
                  <p className="text-xs opacity-80">{rec.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default ProactiveRecommendations;
