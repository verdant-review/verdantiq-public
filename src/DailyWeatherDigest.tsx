import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sun,
  CloudRain,
  Thermometer,
  Droplets,
  Wind,
  Sprout,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle
} from "lucide-react";

interface DailyWeatherDigestProps {
  latitude?: number | null;
  longitude?: number | null;
  region?: string;
  crops?: string[];
}

interface DigestData {
  temperature: number;
  humidity: number;
  rainfall: number;
  wind_speed: number;
  condition: string;
  soil_temperature_0cm?: number;
  soil_moisture_0_1cm?: number;
  forecast?: any[];
}

const DailyWeatherDigest: React.FC<DailyWeatherDigestProps> = ({
  latitude,
  longitude,
  region,
  crops = []
}) => {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  const hasCoords = latitude != null && longitude != null;

  const fetchDigest = async () => {
    if (!hasCoords) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const body: any = { latitude, longitude, region: region || "Your Farm" };
      const { data: weatherData, error } = await supabase.functions.invoke("weather-data", { body });
      if (error) throw error;
      if (weatherData?.data?.[0]) {
        setData(weatherData.data[0]);
      }
    } catch (err) {
      console.error("Weather digest error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigest();
  }, [latitude, longitude, region]);

  const getActionItems = (): { icon: React.ElementType; text: string; type: "good" | "warning" | "danger" }[] => {
    if (!data) return [];
    const items: { icon: React.ElementType; text: string; type: "good" | "warning" | "danger" }[] = [];

    // Temperature actions
    if (data.temperature > 35) {
      items.push({ icon: Thermometer, text: "Extreme heat — irrigate early morning, provide shade for seedlings", type: "danger" });
    } else if (data.temperature > 30) {
      items.push({ icon: Thermometer, text: "Hot day — increase watering frequency", type: "warning" });
    } else if (data.temperature < 5) {
      items.push({ icon: AlertTriangle, text: "Frost risk — cover sensitive crops tonight", type: "danger" });
    } else if (data.temperature >= 20 && data.temperature <= 30) {
      items.push({ icon: Sprout, text: "Ideal growing temperature — good day for field work", type: "good" });
    }

    // Rainfall actions
    if (data.rainfall > 20) {
      items.push({ icon: CloudRain, text: "Heavy rain expected — avoid spraying, check drainage", type: "danger" });
    } else if (data.rainfall > 5) {
      items.push({ icon: Droplets, text: "Light rain — skip irrigation today", type: "good" });
    } else if (data.rainfall < 1 && data.humidity < 40) {
      items.push({ icon: AlertTriangle, text: "Dry conditions — irrigate crops, monitor soil moisture", type: "warning" });
    }

    // Wind actions
    if (data.wind_speed && data.wind_speed > 25) {
      items.push({ icon: Wind, text: "Strong winds — delay foliar spraying", type: "warning" });
    }

    // Soil conditions
    if (data.soil_moisture_0_1cm !== undefined && data.soil_moisture_0_1cm < 15) {
      items.push({ icon: Droplets, text: "Low soil moisture — deep watering recommended", type: "warning" });
    }

    if (items.length === 0) {
      items.push({ icon: CheckCircle, text: "Conditions look good — proceed with planned activities", type: "good" });
    }

    return items;
  };

  if (!hasCoords) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500" />
            Today's Farm Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Set your farm location on the map to see weather tailored to your fields.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500" />
            Today's Farm Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const actionItems = getActionItems();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500" />
            Today's Farm Weather
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchDigest} className="h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current conditions row */}
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <Thermometer className="h-4 w-4 mx-auto text-red-500 mb-1" />
            <div className="text-lg font-bold">{data.temperature?.toFixed(0)}°C</div>
            <div className="text-xs text-muted-foreground">Temp</div>
          </div>
          <div>
            <Droplets className="h-4 w-4 mx-auto text-blue-500 mb-1" />
            <div className="text-lg font-bold">{data.humidity}%</div>
            <div className="text-xs text-muted-foreground">Humidity</div>
          </div>
          <div>
            <CloudRain className="h-4 w-4 mx-auto text-blue-600 mb-1" />
            <div className="text-lg font-bold">{data.rainfall?.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Rain mm</div>
          </div>
          <div>
            <Wind className="h-4 w-4 mx-auto text-gray-500 mb-1" />
            <div className="text-lg font-bold">{data.wind_speed?.toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">km/h</div>
          </div>
        </div>

        {/* Action items */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Today's Actions</div>
          {actionItems.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 text-sm p-2 rounded-lg ${
                item.type === "danger"
                  ? "bg-destructive/10 text-destructive"
                  : item.type === "warning"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-primary/5 text-primary"
              }`}
            >
              <item.icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{item.text}</span>
            </div>
          ))}
        </div>

        {/* Soil conditions if available */}
        {(data.soil_temperature_0cm !== undefined || data.soil_moisture_0_1cm !== undefined) && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            {data.soil_temperature_0cm !== undefined && (
              <div className="text-center">
                <div className="text-sm font-medium">{data.soil_temperature_0cm?.toFixed(1)}°C</div>
                <div className="text-xs text-muted-foreground">Soil Temp</div>
              </div>
            )}
            {data.soil_moisture_0_1cm !== undefined && (
              <div className="text-center">
                <div className="text-sm font-medium">{data.soil_moisture_0_1cm?.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Soil Moisture</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyWeatherDigest;
