import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Leaf, RefreshCw, TrendingUp, Droplets, Thermometer, CloudRain, AlertTriangle, X, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { trackEvent } from "@/hooks/useTelemetry";
import AIAdvisoryBadge from "@/components/AIAdvisoryBadge";

interface CropHealthMonitorProps {
  farmId: string;
  latitude: number;
  longitude: number;
  farmName: string;
}

interface NdviData {
  ndvi: number;
  health_status: string;
  health_color: string;
  source?: string;
  image_captured_at?: string | null;
  cloud_cover_pct?: number | null;
  timeline: Array<{
    date: string;
    ndvi: number;
    soil_moisture: number;
    temperature_max: number;
    temperature_min: number;
    precipitation: number;
    et0: number;
  }>;
  factors: {
    avg_soil_moisture?: number;
    avg_temperature?: number;
    total_precipitation_14d?: number;
    avg_evapotranspiration?: number;
  };
}

function daysAgo(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / (24 * 3600 * 1000));
}

interface NdviAnomaly {
  id: string;
  severity: string;
  drop_pct: number | null;
  ndvi_current: number;
  ndvi_previous: number | null;
  diagnosis: string | null;
  recommended_actions: string[] | null;
  detected_at: string;
}

const CropHealthMonitor: React.FC<CropHealthMonitorProps> = ({ farmId, latitude, longitude, farmName }) => {
  const [data, setData] = useState<NdviData | null>(null);
  const [loading, setLoading] = useState(false);
  const [historicalNdvi, setHistoricalNdvi] = useState<any[]>([]);
  const [anomaly, setAnomaly] = useState<NdviAnomaly | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchNdviData = async () => {
    setLoading(true);
    try {
      trackEvent("feature_used", { feature: "satellite_ndvi", farm_id: farmId });
      const { data: result, error } = await supabase.functions.invoke('satellite-ndvi', {
        body: { farm_id: farmId, latitude, longitude }
      });

      if (error) throw error;
      if (result?.success) {
        setData(result);
      }
    } catch (err: any) {
      console.error("NDVI fetch error:", err);
      toast({
        title: "Error",
        description: "Failed to fetch crop health data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistorical = async () => {
    const { data: hist } = await supabase
      .from("satellite_imagery")
      .select("ndvi_value, captured_at, source")
      .eq("farm_id", farmId)
      .order("captured_at", { ascending: true })
      .limit(30);

    if (hist) {
      setHistoricalNdvi(hist.map((h: any) => {
        const isReal = h.source === "sentinel-2";
        return {
          date: new Date(h.captured_at).toLocaleDateString(),
          ndvi: h.ndvi_value,
          source: h.source,
          sentinel: isReal ? h.ndvi_value : null,
          estimated: isReal ? null : h.ndvi_value,
        };
      }));
    }
  };

  const fetchActiveAnomaly = async () => {
    const { data: rows } = await (supabase as any)
      .from("ndvi_anomalies")
      .select("id, severity, drop_pct, ndvi_current, ndvi_previous, diagnosis, recommended_actions, detected_at")
      .eq("farm_id", farmId)
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(1);
    if (rows && rows.length > 0) setAnomaly(rows[0] as NdviAnomaly);
    else setAnomaly(null);
  };

  const resolveAnomaly = async () => {
    if (!anomaly) return;
    await (supabase as any)
      .from("ndvi_anomalies")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", anomaly.id);
    setAnomaly(null);
    toast({ title: "Marked resolved", description: "The alert won't show again." });
  };

  useEffect(() => {
    fetchNdviData();
    fetchHistorical();
    fetchActiveAnomaly();
  }, [farmId]);

  const getHealthBadgeClass = (status: string) => {
    switch (status) {
      case "Excellent": return "bg-green-100 text-green-800 border-green-300";
      case "Good": return "bg-lime-100 text-lime-800 border-lime-300";
      case "Moderate": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "Stressed": return "bg-orange-100 text-orange-800 border-orange-300";
      case "Critical": return "bg-red-100 text-red-800 border-red-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getNdviColor = (ndvi: number) => {
    if (ndvi >= 0.6) return "hsl(var(--primary))";
    if (ndvi >= 0.4) return "#84cc16";
    if (ndvi >= 0.25) return "#eab308";
    if (ndvi >= 0.1) return "#f97316";
    return "#ef4444";
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="bg-primary/5 border-b pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-primary flex items-center gap-2">
                <Leaf className="h-5 w-5" />
                Crop Health Monitor
              </CardTitle>
              <AIAdvisoryBadge compact />
            </div>
            <CardDescription>Vegetation index analysis for {farmName}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <Badge className={getHealthBadgeClass(data.health_status)}>
                {data.health_status}
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={fetchNdviData} disabled={loading}>
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {anomaly && !dismissed && (
          <div
            className={`rounded-lg border-l-4 p-3 ${
              anomaly.severity === "critical"
                ? "border-l-red-500 bg-red-50 dark:bg-red-950/30"
                : "border-l-orange-500 bg-orange-50 dark:bg-orange-950/30"
            }`}
            role="alert"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 mt-0.5 ${
                    anomaly.severity === "critical" ? "text-red-600" : "text-orange-600"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">
                    Crop stress detected
                    {anomaly.drop_pct != null && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        NDVI {anomaly.ndvi_current.toFixed(2)}
                        {anomaly.ndvi_previous != null && ` (was ${anomaly.ndvi_previous.toFixed(2)}, ${anomaly.drop_pct.toFixed(0)}% drop)`}
                      </span>
                    )}
                  </div>
                  {anomaly.diagnosis && (
                    <p className="text-sm mt-1 text-foreground/90">{anomaly.diagnosis}</p>
                  )}
                  {anomaly.recommended_actions && anomaly.recommended_actions.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {anomaly.recommended_actions.map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted-foreground">{i + 1}.</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>Mudhumeni Hungwe • Powered by Zyterra</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={resolveAnomaly}>
                      Mark resolved
                    </Button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {loading && !data ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-primary mr-2" />
            <span className="text-muted-foreground">Analyzing crop health...</span>
          </div>
        ) : data ? (
          <>
            {/* NDVI Score */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Vegetation Index (NDVI)</span>
                  <span className="text-sm font-bold" style={{ color: getNdviColor(data.ndvi) }}>
                    {data.ndvi.toFixed(2)}
                  </span>
                </div>
                <Progress value={Math.max(0, data.ndvi) * 100} className="h-3" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Bare soil</span>
                  <span>Sparse</span>
                  <span>Moderate</span>
                  <span>Dense</span>
                </div>
              </div>
            </div>

            {/* Environmental Factors */}
            {data.factors && data.factors.avg_soil_moisture != null && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <Droplets className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                  <div className="text-sm font-bold">{((data.factors.avg_soil_moisture ?? 0) * 100).toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground">Avg Soil Moisture</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <Thermometer className="h-4 w-4 mx-auto mb-1 text-orange-500" />
                  <div className="text-sm font-bold">{data.factors.avg_temperature}°C</div>
                  <div className="text-xs text-muted-foreground">Avg Temperature</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <CloudRain className="h-4 w-4 mx-auto mb-1 text-blue-600" />
                  <div className="text-sm font-bold">{data.factors.total_precipitation_14d}mm</div>
                  <div className="text-xs text-muted-foreground">14-Day Rainfall</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <TrendingUp className="h-4 w-4 mx-auto mb-1 text-green-600" />
                  <div className="text-sm font-bold">{data.factors.avg_evapotranspiration}mm</div>
                  <div className="text-xs text-muted-foreground">Avg ET₀</div>
                </div>
              </div>
            )}

            {/* NDVI Timeline Chart */}
            {data.timeline.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">14-Day Health Trend</h4>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={data.timeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === "ndvi") return [value.toFixed(3), "NDVI"];
                        return [value, name];
                      }}
                    />
                    <defs>
                      <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="ndvi"
                      stroke="hsl(var(--primary))"
                      fill="url(#ndviGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Historical NDVI Records */}
            {historicalNdvi.length > 1 && (
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h4 className="text-sm font-medium">Historical Records</h4>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: "hsl(var(--primary))" }} />
                      Sentinel-2
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-full border border-amber-500" style={{ background: "transparent" }} />
                      Estimated
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={historicalNdvi}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 9 }} />
                    <Tooltip
                      formatter={(value: any, name: string) => {
                        if (value == null) return ["—", name];
                        return [Number(value).toFixed(2), name === "sentinel" ? "Sentinel-2" : "Estimated"];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="estimated"
                      stroke="#f59e0b"
                      strokeDasharray="4 3"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#fff", stroke: "#f59e0b" }}
                      connectNulls
                      name="Estimated"
                    />
                    <Line
                      type="monotone"
                      dataKey="sentinel"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "hsl(var(--primary))" }}
                      connectNulls
                      name="Sentinel-2"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}


            {(() => {
              const isReal = data.source === 'sentinel-2';
              const age = daysAgo(data.image_captured_at);
              if (isReal) {
                return (
                  <div className="text-xs bg-green-50 border border-green-200 text-green-900 p-2 rounded flex items-start gap-2">
                    <span className="font-semibold">Sentinel-2</span>
                    <span className="flex items-center gap-1">
                      · captured {age == null ? 'recently' : age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}
                      {data.cloud_cover_pct != null && ` · ${Math.round(data.cloud_cover_pct)}% cloud`}
                      {age != null && age > 13 && (
                        <TooltipProvider delayDuration={100}>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 cursor-help text-green-700" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              Optical satellites need clear skies. During the cool/misty season scenes with high cloud cover are filtered out, so the most recent cloud-free pass is shown.
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </div>
                );
              }
              return (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded">
                  <span className="font-semibold">Estimated</span> · no clear Sentinel-2 image in the last 14 days (cloud cover or quota). Index derived from OpenMeteo soil moisture, temperature, rainfall & ET₀.
                </div>
              );
            })()}
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Leaf className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No crop health data available</p>
            <Button size="sm" onClick={fetchNdviData} className="mt-2">
              Analyze Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CropHealthMonitor;
