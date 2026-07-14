import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, CloudRain, Thermometer, Wind, Snowflake, RefreshCw, CheckCircle, Shield } from "lucide-react";

interface WeatherAlertsPanelProps {
  farmId: string;
  latitude: number;
  longitude: number;
  farmName: string;
}

interface WeatherAlert {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  is_active: boolean;
  created_at: string;
  metadata: any;
}

// Alert thresholds for Zimbabwe agriculture
const ALERT_THRESHOLDS = {
  frost: { temp_min: 2 },           // Below 2°C = frost risk
  drought_stress: { precip_max: 5, days: 7 },  // <5mm over 7 days
  heavy_rain: { precip_min: 50 },   // >50mm in a day
  extreme_heat: { temp_max: 38 },   // >38°C
  high_wind: { wind_max: 60 },      // >60 km/h
};

const WeatherAlertsPanel: React.FC<WeatherAlertsPanelProps> = ({ farmId, latitude, longitude, farmName }) => {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("weather_alerts")
        .select("*")
        .eq("farm_id", farmId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setAlerts((data || []) as WeatherAlert[]);
    } catch (err: any) {
      console.error("Error fetching alerts:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateAlerts = async () => {
    setGenerating(true);
    try {
      // Fetch 7-day forecast for the farm
      const { data: weatherResult, error: weatherError } = await supabase.functions.invoke('weather-data', {
        body: { latitude, longitude, region: farmName, forecast: true }
      });

      if (weatherError) throw weatherError;

      const forecast = weatherResult?.forecast || [];
      if (forecast.length === 0) {
        toast({ title: "No forecast data", description: "Cannot generate alerts without forecast data." });
        setGenerating(false);
        return;
      }

      const newAlerts: Array<{ alert_type: string; severity: string; message: string; metadata: any }> = [];

      // Check each day's forecast
      for (const day of forecast) {
        // Frost check
        if (day.temperature_min <= ALERT_THRESHOLDS.frost.temp_min) {
          newAlerts.push({
            alert_type: "frost",
            severity: day.temperature_min <= 0 ? "critical" : "warning",
            message: `Frost risk on ${day.date}: minimum temperature expected at ${day.temperature_min}°C. Protect sensitive crops.`,
            metadata: { date: day.date, temp_min: day.temperature_min }
          });
        }

        // Extreme heat
        if (day.temperature_max >= ALERT_THRESHOLDS.extreme_heat.temp_max) {
          newAlerts.push({
            alert_type: "extreme_heat",
            severity: day.temperature_max >= 42 ? "critical" : "warning",
            message: `Extreme heat on ${day.date}: ${day.temperature_max}°C expected. Increase irrigation and provide shade for livestock.`,
            metadata: { date: day.date, temp_max: day.temperature_max }
          });
        }

        // Heavy rain
        if (day.rainfall >= ALERT_THRESHOLDS.heavy_rain.precip_min) {
          newAlerts.push({
            alert_type: "heavy_rain",
            severity: day.rainfall >= 100 ? "critical" : "warning",
            message: `Heavy rainfall on ${day.date}: ${day.rainfall.toFixed(1)}mm expected. Risk of waterlogging and erosion.`,
            metadata: { date: day.date, rainfall: day.rainfall }
          });
        }

        // High wind
        if (day.wind_speed >= ALERT_THRESHOLDS.high_wind.wind_max) {
          newAlerts.push({
            alert_type: "high_wind",
            severity: day.wind_speed >= 80 ? "critical" : "warning",
            message: `High winds on ${day.date}: ${day.wind_speed.toFixed(0)} km/h. Secure structures and tall crops.`,
            metadata: { date: day.date, wind_speed: day.wind_speed }
          });
        }
      }

      // Drought stress check (cumulative over 7 days)
      const totalPrecip7d = forecast.slice(0, 7).reduce((sum: number, d: any) => sum + (d.rainfall || 0), 0);
      if (totalPrecip7d < ALERT_THRESHOLDS.drought_stress.precip_max) {
        newAlerts.push({
          alert_type: "drought_stress",
          severity: totalPrecip7d < 1 ? "critical" : "warning",
          message: `Drought stress alert: Only ${totalPrecip7d.toFixed(1)}mm of rain expected in the next 7 days. Consider supplemental irrigation.`,
          metadata: { total_precip_7d: totalPrecip7d }
        });
      }

      // Deactivate old alerts for this farm
      await supabase
        .from("weather_alerts")
        .update({ is_active: false } as any)
        .eq("farm_id", farmId)
        .eq("is_active", true);

      // Insert new alerts
      if (newAlerts.length > 0) {
        const alertRecords = newAlerts.map(a => ({
          farm_id: farmId,
          alert_type: a.alert_type,
          severity: a.severity,
          message: a.message,
          metadata: a.metadata,
          is_active: true,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }));

        const { error: insertError } = await supabase
          .from("weather_alerts")
          .insert(alertRecords as any);

        if (insertError) throw insertError;

        toast({
          title: `${newAlerts.length} Alert${newAlerts.length > 1 ? "s" : ""} Generated`,
          description: "Weather alerts updated based on 7-day forecast."
        });
      } else {
        toast({
          title: "No Alerts",
          description: "Weather conditions look favorable for the next 7 days."
        });
      }

      fetchAlerts();
    } catch (err: any) {
      console.error("Alert generation error:", err);
      toast({
        title: "Error",
        description: "Failed to generate weather alerts",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [farmId]);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "frost": return <Snowflake className="h-4 w-4" />;
      case "heavy_rain": return <CloudRain className="h-4 w-4" />;
      case "extreme_heat": return <Thermometer className="h-4 w-4" />;
      case "high_wind": return <Wind className="h-4 w-4" />;
      case "drought_stress": return <AlertTriangle className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-100 text-red-800 border-red-300";
      case "warning": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default: return "bg-blue-100 text-blue-800 border-blue-300";
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="bg-amber-50/50 border-b pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-amber-900 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Weather Alerts
            </CardTitle>
            <CardDescription>Agricultural weather warnings for {farmName}</CardDescription>
          </div>
          <Button 
            size="sm" 
            onClick={generateAlerts} 
            disabled={generating}
            className="bg-amber-700 hover:bg-amber-800"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Scanning..." : "Scan Forecast"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
            <span className="text-muted-foreground text-sm">Loading alerts...</span>
          </div>
        ) : alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${getSeverityClass(alert.severity)}`}
              >
                {getAlertIcon(alert.alert_type)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {alert.alert_type.replace("_", " ")}
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">
                      {alert.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm font-medium">No active weather alerts</p>
            <p className="text-xs mt-1">Click "Scan Forecast" to check for upcoming risks</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeatherAlertsPanel;
