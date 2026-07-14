import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudSun, Droplets, Wind, Thermometer, Sprout, AlertTriangle } from "lucide-react";

interface ForecastDay {
  date: string;
  temperature_max: number;
  temperature_min: number;
  rainfall: number;
  precipitation_probability: number;
  wind_speed: number;
  condition: string;
}

interface WeatherForecastProps {
  region: string;
  forecastData: ForecastDay[];
}

const WeatherForecast = ({ region, forecastData }: WeatherForecastProps) => {
  
  const getConditionColor = (condition: string) => {
    if (condition.includes('rain')) return 'bg-blue-100 text-blue-800';
    if (condition.includes('sun') || condition.includes('clear')) return 'bg-yellow-100 text-yellow-800';
    if (condition.includes('cloud')) return 'bg-gray-100 text-gray-800';
    return 'bg-primary/10 text-primary';
  };

  const getAgriculturalAdvice = (day: ForecastDay) => {
    const advice = [];
    
    if (day.rainfall > 10) {
      advice.push({ icon: Droplets, text: "Heavy rainfall expected - delay planting or spraying", color: "text-blue-600" });
    } else if (day.rainfall > 5) {
      advice.push({ icon: Droplets, text: "Moderate rain - good for irrigation needs", color: "text-blue-500" });
    } else if (day.rainfall < 2) {
      advice.push({ icon: AlertTriangle, text: "Low rainfall - irrigation recommended", color: "text-orange-600" });
    }
    
    if (day.temperature_max > 35) {
      advice.push({ icon: Thermometer, text: "High temperatures - monitor crop stress", color: "text-red-600" });
    } else if (day.temperature_max > 25 && day.temperature_max <= 35) {
      advice.push({ icon: Sprout, text: "Optimal growing temperatures", color: "text-emerald-600" });
    } else if (day.temperature_max < 15) {
      advice.push({ icon: AlertTriangle, text: "Cool weather - frost risk for sensitive crops", color: "text-blue-600" });
    }
    
    if (day.wind_speed > 30) {
      advice.push({ icon: Wind, text: "Strong winds - secure structures and delay spraying", color: "text-orange-600" });
    }
    
    return advice;
  };

  const getTotalRainfall = () => {
    return forecastData.reduce((sum, day) => sum + day.rainfall, 0).toFixed(1);
  };

  const getAvgTemperature = () => {
    const avgMax = forecastData.reduce((sum, day) => sum + day.temperature_max, 0) / forecastData.length;
    const avgMin = forecastData.reduce((sum, day) => sum + day.temperature_min, 0) / forecastData.length;
    return { max: avgMax.toFixed(1), min: avgMin.toFixed(1) };
  };

  const avgTemp = getAvgTemperature();

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudSun className="h-5 w-5" />
            7-Day Forecast: {region}
          </CardTitle>
          <CardDescription>Agricultural weather outlook</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-foreground">{getTotalRainfall()} mm</div>
              <div className="text-sm text-muted-foreground">Expected Rainfall</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{avgTemp.max}°C</div>
              <div className="text-sm text-muted-foreground">Avg High</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{avgTemp.min}°C</div>
              <div className="text-sm text-muted-foreground">Avg Low</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Forecast Cards */}
      <div className="space-y-4">
        {forecastData.map((day, index) => {
          const advice = getAgriculturalAdvice(day);
          const dayDate = new Date(day.date);
          const dayName = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : dayDate.toLocaleDateString('en-US', { weekday: 'long' });
          
          return (
            <Card key={day.date}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{dayName}</CardTitle>
                    <CardDescription>{dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</CardDescription>
                  </div>
                  <Badge className={getConditionColor(day.condition)}>
                    {day.condition}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Weather Stats */}
                <div className="grid grid-cols-5 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-red-500" />
                    <div>
                      <div className="font-semibold">{day.temperature_max}°C</div>
                      <div className="text-muted-foreground text-xs">High</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-blue-500" />
                    <div>
                      <div className="font-semibold">{day.temperature_min}°C</div>
                      <div className="text-muted-foreground text-xs">Low</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-blue-600" />
                    <div>
                      <div className="font-semibold">{day.rainfall.toFixed(1)} mm</div>
                      <div className="text-muted-foreground text-xs">Rain</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CloudSun className="h-4 w-4 text-blue-400" />
                    <div>
                      <div className="font-semibold">{day.precipitation_probability}%</div>
                      <div className="text-muted-foreground text-xs">Chance</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wind className="h-4 w-4 text-gray-500" />
                    <div>
                      <div className="font-semibold">{day.wind_speed.toFixed(0)} km/h</div>
                      <div className="text-muted-foreground text-xs">Wind</div>
                    </div>
                  </div>
                </div>

                {/* Agricultural Advice */}
                {advice.length > 0 && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">Farming Recommendations:</p>
                    {advice.map((item, idx) => (
                      <div key={idx} className={`flex items-center gap-2 text-sm ${item.color}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* General Advice Card */}
      <Card className="bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5" />
            Week Overview & Planning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {parseFloat(getTotalRainfall()) > 50 && (
            <p className="text-foreground">
              <strong>High rainfall week:</strong> Ensure drainage systems are clear. Delay chemical applications.
            </p>
          )}
          {parseFloat(getTotalRainfall()) < 10 && (
            <p className="text-foreground">
              <strong>Dry week ahead:</strong> Plan irrigation schedules. Monitor soil moisture levels closely.
            </p>
          )}
          {parseFloat(avgTemp.max) > 30 && (
            <p className="text-foreground">
              <strong>Hot conditions:</strong> Increase watering frequency. Watch for heat stress in sensitive crops.
            </p>
          )}
          <p className="text-muted-foreground">
            Plan your farm activities based on this forecast. Weather conditions can change - check daily updates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default WeatherForecast;
