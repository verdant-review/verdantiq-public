import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AIAdvisoryBadge from "@/components/AIAdvisoryBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Lightbulb, 
  AlertTriangle, 
  CheckCircle, 
  Thermometer, 
  Droplets,
  RefreshCw,
  Leaf,
  Target
} from "lucide-react";

interface PlantingInsightsProps {
  cropType: string;
  status: string;
  plantingDate?: string | null;
  harvestDate?: string | null;
  areaHectares?: number;
  weather?: {
    temperature?: number;
    humidity?: number;
    rainfall?: number;
    condition?: string;
    soil_temperature_0cm?: number;
    soil_moisture_0_1cm?: number;
  };
  region?: string;
}

interface InsightsData {
  stage_summary: string;
  weather_impact: string;
  immediate_actions: string[];
  warnings: string[];
  optimal_conditions: {
    temperature_range: string;
    soil_moisture: string;
    soil_temperature: string;
  };
  next_milestone: string;
  tips: string[];
}

const PlantingInsights: React.FC<PlantingInsightsProps> = ({
  cropType,
  status,
  plantingDate,
  harvestDate,
  areaHectares,
  weather,
  region
}) => {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('planting-insights', {
        body: {
          cropType,
          status,
          plantingDate,
          harvestDate,
          areaHectares,
          weather: weather ? {
            temperature: weather.temperature,
            humidity: weather.humidity,
            rainfall: weather.rainfall,
            condition: weather.condition,
            soil_temperature: weather.soil_temperature_0cm,
            soil_moisture: weather.soil_moisture_0_1cm
          } : undefined,
          region
        }
      });

      if (fnError) throw fnError;

      if (data?.insights) {
        setInsights(data.insights);
      }
    } catch (err: any) {
      console.error('Error fetching insights:', err);
      setError(err.message || 'Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cropType && status) {
      fetchInsights();
    }
  }, [cropType, status]);

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-green-800 flex items-center text-base">
            <Lightbulb className="h-5 w-5 mr-2 text-yellow-500" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-50 border-red-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <span className="text-sm">Failed to load insights</span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchInsights}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insights) return null;

  return (
    <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-green-800 flex items-center text-base">
            <Lightbulb className="h-5 w-5 mr-2 text-yellow-500" />
            AI Insights for {cropType}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchInsights} className="h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {status} Stage
          </Badge>
          <AIAdvisoryBadge compact />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage Summary */}
        <div className="p-3 bg-white/60 rounded-lg border border-green-100">
          <p className="text-sm text-gray-700">{insights.stage_summary}</p>
        </div>

        {/* Weather Impact */}
        {insights.weather_impact && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-start">
              <Droplets className="h-4 w-4 text-blue-500 mr-2 mt-0.5" />
              <div>
                <div className="font-medium text-blue-800 text-sm">Weather Impact</div>
                <p className="text-xs text-blue-700 mt-1">{insights.weather_impact}</p>
              </div>
            </div>
          </div>
        )}

        {/* Immediate Actions */}
        {insights.immediate_actions && insights.immediate_actions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center text-sm font-medium text-green-800">
              <CheckCircle className="h-4 w-4 mr-2" />
              Immediate Actions
            </div>
            <ul className="space-y-1">
              {insights.immediate_actions.map((action, idx) => (
                <li key={idx} className="flex items-start text-sm">
                  <span className="text-green-500 mr-2">•</span>
                  <span className="text-gray-700">{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {insights.warnings && insights.warnings.length > 0 && (
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center text-sm font-medium text-amber-800 mb-2">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Warnings
            </div>
            <ul className="space-y-1">
              {insights.warnings.map((warning, idx) => (
                <li key={idx} className="text-xs text-amber-700">
                  ⚠️ {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Optimal Conditions */}
        {insights.optimal_conditions && (
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-white/60 rounded-lg border border-green-100 text-center">
              <Thermometer className="h-4 w-4 mx-auto text-orange-500 mb-1" />
              <div className="text-xs text-gray-600">Temperature</div>
              <div className="text-sm font-medium">{insights.optimal_conditions.temperature_range}</div>
            </div>
            <div className="p-2 bg-white/60 rounded-lg border border-green-100 text-center">
              <Droplets className="h-4 w-4 mx-auto text-blue-500 mb-1" />
              <div className="text-xs text-gray-600">Soil Moisture</div>
              <div className="text-sm font-medium">{insights.optimal_conditions.soil_moisture}</div>
            </div>
            <div className="p-2 bg-white/60 rounded-lg border border-green-100 text-center">
              <Leaf className="h-4 w-4 mx-auto text-green-500 mb-1" />
              <div className="text-xs text-gray-600">Soil Temp</div>
              <div className="text-sm font-medium">{insights.optimal_conditions.soil_temperature}</div>
            </div>
          </div>
        )}

        {/* Next Milestone */}
        {insights.next_milestone && (
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
            <div className="flex items-start">
              <Target className="h-4 w-4 text-purple-500 mr-2 mt-0.5" />
              <div>
                <div className="font-medium text-purple-800 text-sm">Next Milestone</div>
                <p className="text-xs text-purple-700 mt-1">{insights.next_milestone}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        {insights.tips && insights.tips.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center text-sm font-medium text-green-800">
              <Lightbulb className="h-4 w-4 mr-2 text-yellow-500" />
              Pro Tips
            </div>
            <div className="grid gap-2">
              {insights.tips.map((tip, idx) => (
                <div key={idx} className="text-xs bg-yellow-50 p-2 rounded border border-yellow-100 text-yellow-800">
                  💡 {tip}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PlantingInsights;
