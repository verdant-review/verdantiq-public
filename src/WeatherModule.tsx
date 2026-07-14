
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWeatherData } from "@/hooks/useWeatherData";
import { useFarmLocation } from "@/hooks/useFarmLocation";
import { useToast } from "@/hooks/use-toast";
import WeatherForecast from "./WeatherForecast";
import { 
  CloudSun, 
  Droplets, 
  Wind, 
  Thermometer, 
  Search, 
  RefreshCw,
  TrendingUp,
  MapPin,
  Gauge,
  AlertTriangle,
  Wifi,
  WifiOff,
  Navigation
} from "lucide-react";

const WeatherModule = () => {
  const { toast } = useToast();
  const farmLocation = useFarmLocation();
  const [searchRegion, setSearchRegion] = useState("");
  const [useGeolocation, setUseGeolocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [forecastDialogOpen, setForecastDialogOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [loadingForecast, setLoadingForecast] = useState(false);

  // Resolution priority: explicit search → browser geolocation → user's farm location
  const activeParams = searchRegion
    ? { region: searchRegion }
    : useGeolocation && userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, region: "Your Location" }
    : farmLocation.hasLocation
    ? {
        latitude: farmLocation.latitude!,
        longitude: farmLocation.longitude!,
        region: farmLocation.region || farmLocation.farmName || "Your Farm",
      }
    : {};

  const { weatherData, loading, error, refetch, fetchForecast } = useWeatherData(activeParams);

  const handleViewForecast = async (region: string, latitude?: number, longitude?: number) => {
    setSelectedRegion(region);
    setForecastDialogOpen(true);
    setLoadingForecast(true);

    try {
      const forecast = await fetchForecast(region, latitude, longitude);
      setForecastData(forecast);
      
      if (forecast.length === 0) {
        toast({
          title: "No Forecast Data",
          description: "7-day forecast is not available for this region yet.",
          variant: "default"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to load forecast data",
        variant: "destructive"
      });
    } finally {
      setLoadingForecast(false);
    }
  };

  const handleSearch = () => {
    setUseGeolocation(false);
    refetch();
  };

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support geolocation.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Getting your location...",
      description: "Please allow location access in your browser."
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        setUseGeolocation(true);
        setSearchRegion("");
        refetch({ latitude, longitude, region: "Your Location" });
        toast({
          title: "Location found!",
          description: "Showing weather for your current location."
        });
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast({
          title: "Location access denied",
          description: "Please enable location access to use this feature.",
          variant: "destructive"
        });
      }
    );
  };

  const getDataSourceBadge = (weather: any) => {
    switch (weather.data_source) {
      case 'openmeteo_live':
        return (
          <Badge className="bg-green-100 text-green-800">
            <Wifi className="h-3 w-3 mr-1" />
            Live Data
          </Badge>
        );
      case 'cached_fallback':
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <WifiOff className="h-3 w-3 mr-1" />
            Cached Data
          </Badge>
        );
      case 'default_fallback':
        return (
          <Badge className="bg-red-100 text-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Fallback Data
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-100 text-blue-800">
            <Wifi className="h-3 w-3 mr-1" />
            Cached
          </Badge>
        );
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <CloudSun className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Weather Data Unavailable</h3>
          <p className="text-gray-600 mb-4">Unable to fetch weather information at the moment.</p>
          <Button onClick={() => refetch()} className="bg-green-900 hover:bg-green-800">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-green-900">Weather Intelligence</h2>
          <p className="text-gray-600">
            {farmLocation.hasLocation && !searchRegion && !useGeolocation
              ? `Showing weather for ${farmLocation.farmName || farmLocation.region || "your farm"}`
              : "Real-time weather data with enhanced soil monitoring"}
          </p>
        </div>
        <Badge className="bg-green-100 text-green-800 w-fit">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
          Powered by OpenMeteo API
        </Badge>
      </div>

      {!farmLocation.hasLocation && !farmLocation.loading && !searchRegion && !useGeolocation && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-sm text-amber-900">
            Set your farm location on the Farm Map to get weather tailored to your fields, or search for a region / use your browser location below.
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by region (e.g., Harare, Bulawayo, Mutare)..."
                value={searchRegion}
                onChange={(e) => {
                  setSearchRegion(e.target.value);
                  setUseGeolocation(false);
                }}
                className="pl-10"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGeolocation} disabled={loading} variant="outline" className="border-green-900 text-green-900 hover:bg-green-50">
                <Navigation className="h-4 w-4 mr-2" />
                My Location
              </Button>
              <Button onClick={handleSearch} disabled={loading} className="bg-green-900 hover:bg-green-800">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {useGeolocation && userLocation && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-800">
              <MapPin className="h-4 w-4" />
              <span>Showing weather for your current location ({userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)})</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weather Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-32 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {weatherData.map((weather: any) => (
            <Card key={weather.region} className="border-green-200 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-green-900 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {weather.region}
                    </CardTitle>
                    <CardDescription className="capitalize">{weather.condition}</CardDescription>
                  </div>
                  <div className="flex flex-col gap-1">
                    {getDataSourceBadge(weather)}
                    <Badge variant="outline" className="text-xs">
                      {new Date(weather.cached_at).toLocaleTimeString()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Fallback Warning */}
                {weather.fallback_reason && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-yellow-800 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Using fallback data: API temporarily unavailable</span>
                    </div>
                  </div>
                )}

                {/* Main Temperature */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-900">
                    {weather.temperature?.toFixed(1)}°C
                  </div>
                </div>

                {/* Weather Stats */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-blue-500" />
                    <span>Humidity: {weather.humidity}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wind className="h-4 w-4 text-gray-500" />
                    <span>Wind: {weather.wind_speed?.toFixed(1)} km/h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-blue-600" />
                    <span>Rain: {weather.rainfall?.toFixed(1)} mm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-green-600" />
                    <span>Live Data</span>
                  </div>
                </div>

                {/* Enhanced Soil Conditions */}
                <div className="border-t pt-3">
                  <h4 className="font-medium text-green-900 mb-2 flex items-center gap-1">
                    <Thermometer className="h-4 w-4" />
                    Soil Temperature & Moisture
                  </h4>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Surface (0cm):</span>
                        <span className="font-medium">{weather.soil_temperature_0cm?.toFixed(1)}°C</span>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>6cm Depth:</span>
                        <span className="font-medium">{weather.soil_temperature_6cm?.toFixed(1)}°C</span>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>18cm Depth:</span>
                        <span className="font-medium">{weather.soil_temperature_18cm?.toFixed(1)}°C</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t space-y-2">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span>Surface Moisture (0-1cm):</span>
                          <span className="font-medium">{((weather.soil_moisture_0_1cm || 0) * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={(weather.soil_moisture_0_1cm || 0) * 100} className="h-2" />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span>Shallow Moisture (1-3cm):</span>
                          <span className="font-medium">{((weather.soil_moisture_1_3cm || 0) * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={(weather.soil_moisture_1_3cm || 0) * 100} className="h-2" />
                      </div>

                      {weather.soil_moisture_3_9cm && (
                        <div>
                          <div className="flex justify-between mb-1">
                            <span>Mid Moisture (3-9cm):</span>
                            <span className="font-medium">{((weather.soil_moisture_3_9cm || 0) * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={(weather.soil_moisture_3_9cm || 0) * 100} className="h-2" />
                        </div>
                      )}

                      {weather.soil_moisture_9_27cm && (
                        <div>
                          <div className="flex justify-between mb-1">
                            <span>Deep Moisture (9-27cm):</span>
                            <span className="font-medium">{((weather.soil_moisture_9_27cm || 0) * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={(weather.soil_moisture_9_27cm || 0) * 100} className="h-2" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full border-green-200 text-green-900 hover:bg-green-50"
                  onClick={() => handleViewForecast(weather.region, weather.latitude, weather.longitude)}
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  View 7-Day Forecast
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Enhanced Info Card */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-green-900">Enhanced Weather Intelligence</CardTitle>
          <CardDescription>
            Multi-layer soil monitoring with automatic fallback systems for reliable data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-green-800 space-y-2">
            <p>
              <strong>Soil Temperature Monitoring:</strong> Surface (0cm), Shallow (6cm), Root Zone (18cm)
            </p>
            <p>
              <strong>Soil Moisture Layers:</strong> Surface (0-1cm), Shallow (1-3cm), Mid (3-9cm), Deep (9-27cm)
            </p>
            <p>
              <strong>Data Reliability:</strong> Live API data with intelligent caching and fallback systems
            </p>
            <p>
              <strong>Update Frequency:</strong> Every 30 minutes with automatic retry on API failures
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Forecast Dialog */}
      <Dialog open={forecastDialogOpen} onOpenChange={setForecastDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>7-Day Weather Forecast</DialogTitle>
          </DialogHeader>
          {loadingForecast ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              <span>Loading forecast...</span>
            </div>
          ) : forecastData.length > 0 ? (
            <WeatherForecast 
              region={selectedRegion} 
              forecastData={forecastData} 
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No forecast data available for this region.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WeatherModule;
