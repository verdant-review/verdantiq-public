
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMarketData } from "@/hooks/useMarketData";
import { ArrowUp, ArrowDown, Search, TrendingUp, RefreshCw, MapPin, Wheat } from "lucide-react";
import MarketTrendsChart from "./MarketTrendsChart";
import { useToast } from "@/hooks/use-toast";

const MarketPrices = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("item");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [trendDialogOpen, setTrendDialogOpen] = useState(false);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const { marketData, mbarePrices, loading, error, refetch, fetchHistoricalData, calculateTrends } = useMarketData();

  const handleViewTrends = async (item: any, isMbare: boolean = false) => {
    setLoadingTrends(true);
    setSelectedItem(item);
    setTrendDialogOpen(true);

    try {
      const data = isMbare 
        ? await fetchHistoricalData('', item.item)
        : await fetchHistoricalData(item.crop);
      
      setHistoricalData(data);
      
      if (data.length === 0) {
        toast({
          title: "Limited Data",
          description: "Not enough historical data available for trend analysis yet.",
          variant: "default"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to load trend data",
        variant: "destructive"
      });
    } finally {
      setLoadingTrends(false);
    }
  };

  // Sort and filter Mbare prices
  // Deduplicate Mbare prices by item name, keeping most recent
  const deduplicatedMbarePrices: any[] = Object.values(
    (mbarePrices as any[]).reduce((acc: Record<string, any>, item: any) => {
      if (!acc[item.item] || new Date(item.captured_at) > new Date(acc[item.item].captured_at)) {
        acc[item.item] = item;
      }
      return acc;
    }, {})
  );

  const filteredMbarePrices = deduplicatedMbarePrices
    .filter((item: any) => {
      const matchesSearch = item.item.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = !dateFilter || new Date(item.captured_at).toDateString() === new Date(dateFilter).toDateString();
      return matchesSearch && matchesDate;
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case "usd_price":
          return (b.usd_price || 0) - (a.usd_price || 0);
        case "zig_price":
          return (b.zig_price || 0) - (a.zig_price || 0);
        case "date":
          return new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime();
        default:
          return a.item.localeCompare(b.item);
      }
    });

  // Allow-list of true grains, pulses & oilseeds (no vegetables)
  const GRAIN_CROPS = new Set([
    'maize', 'wheat', 'soybeans', 'soya beans', 'sugar beans', 'sunflower',
    'sorghum', 'millet', 'rice', 'barley', 'groundnuts', 'cowpeas', 'rapoko',
  ]);

  // Deduplicate and filter grain prices (market_prices) - keep most recent per crop
  // Exclude vegetables: only keep entries whose crop is in the grain allow-list
  // (defensive double-check against unit !== 'kg')
  const deduplicatedMarketData: any[] = Object.values(
    (marketData as any[])
      .filter((item: any) => {
        const cropKey = (item.crop || '').toLowerCase().trim();
        const unit = (item.unit || '').toLowerCase();
        return GRAIN_CROPS.has(cropKey) && unit !== 'kg';
      })
      .reduce((acc: Record<string, any>, item: any) => {
        if (!acc[item.crop] || new Date(item.last_updated) > new Date(acc[item.crop].last_updated)) {
          acc[item.crop] = item;
        }
        return acc;
      }, {})
  );

  const filteredGrainPrices = deduplicatedMarketData
    .filter((item: any) => {
      const matchesSearch = item.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.region.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = !dateFilter || new Date(item.last_updated).toDateString() === new Date(dateFilter).toDateString();
      return matchesSearch && matchesDate;
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case "price":
          return b.price - a.price;
        case "change":
          return (b.price_change || 0) - (a.price_change || 0);
        case "region":
          return a.region.localeCompare(b.region);
        case "date":
          return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
        default:
          return a.crop.localeCompare(b.crop);
      }
    });

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <TrendingUp className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Market Data Unavailable</h3>
          <p className="text-gray-600 mb-4">Unable to fetch market prices at the moment.</p>
          <Button onClick={refetch} className="bg-green-900 hover:bg-green-800">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
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
          <h2 className="text-3xl font-bold text-green-900">Market Prices</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 w-fit">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Live Data
          </Badge>
          <Button 
            onClick={refetch} 
            variant="outline" 
            size="sm"
            disabled={loading}
            className="border-green-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by item, crop, or region..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full sm:w-40"
              />
              <Button
                variant={sortBy === "item" ? "default" : "outline"}
                onClick={() => setSortBy("item")}
                className="bg-green-900 hover:bg-green-800 flex-1 sm:flex-none"
              >
                Item
              </Button>
              <Button
                variant={sortBy === "price" || sortBy === "usd_price" ? "default" : "outline"}
                onClick={() => setSortBy(sortBy === "usd_price" ? "price" : "usd_price")}
                className="bg-green-900 hover:bg-green-800 flex-1 sm:flex-none"
              >
                Price
              </Button>
              <Button
                variant={sortBy === "date" ? "default" : "outline"}
                onClick={() => setSortBy("date")}
                className="bg-green-900 hover:bg-green-800 flex-1 sm:flex-none"
              >
                Date
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 🟩 Mbare Musika Prices Section */}
      <div className="space-y-4">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader>
            <CardTitle className="text-green-900 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              🟩 Mbare Musika Prices
            </CardTitle>
            <CardDescription>Fresh produce prices from Harare's largest market via Zyterra Network</CardDescription>
          </CardHeader>
        </Card>

        {loading && filteredMbarePrices.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse bg-yellow-50 border-yellow-200">
                <CardContent className="pt-6">
                  <div className="h-32 bg-yellow-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMbarePrices.map((item: any) => (
              <Card key={item.id} className="border-yellow-200 hover:shadow-lg transition-shadow bg-yellow-50">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-green-900 text-xl">{item.item}</CardTitle>
                      <CardDescription className="text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Mbare Musika
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-yellow-200 text-yellow-800">
                      Zyterra Network
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          {item.usd_price ? `$${item.usd_price.toFixed(2)}` : "—"}
                        </div>
                        <div className="text-sm text-gray-500">USD/{item.quantity}</div>
                        {!item.usd_price && (
                          <div className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded mt-1">
                            Missing USD Price
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-green-700">
                          {item.zig_price ? `ZWL ${item.zig_price.toLocaleString()}` : "—"}
                        </div>
                        <div className="text-sm text-gray-500">ZWL/{item.quantity}</div>
                        {!item.zig_price && (
                          <div className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded mt-1">
                            Missing ZWL Price
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Updated:</span>
                      <span className="font-medium text-green-700">
                        {new Date(item.captured_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-3 border-yellow-300 text-green-900 hover:bg-yellow-100"
                      onClick={() => handleViewTrends(item, true)}
                    >
                      <TrendingUp className="h-4 w-4 mr-2" />
                      View Trends
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 🌾 Grain Prices Section */}
      <div className="space-y-4">
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-green-900 flex items-center gap-2">
              <Wheat className="h-5 w-5" />
              🌾 Grain Prices
            </CardTitle>
            <CardDescription>Commodity prices from various sources across Zimbabwe</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border border-green-300 bg-white/60 p-3 text-sm text-green-900">
              <strong>Notice:</strong> Approved Incentive Producer Prices for the 2025/26 Summer Season —
              Maize <strong>USD 364.75/MT</strong>, Traditional Grain <strong>USD 364.75/MT</strong>,
              Soya Bean <strong>USD 583.01/MT</strong>, Sunflower <strong>USD 670.46/MT</strong>.
              Prices as set by Government (released 14/04/2026).
            </div>
          </CardContent>
        </Card>

        {loading && filteredGrainPrices.length === 0 ? (
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
            {filteredGrainPrices.map((item: any) => (
              <Card key={item.id} className="border-green-200 hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-green-900 text-xl">{item.crop}</CardTitle>
                    </div>
                    <div className={`flex items-center gap-1 text-sm px-2 py-1 rounded-full ${
                      (item.price_change || 0) > 0 
                        ? 'bg-green-100 text-green-700' 
                        : (item.price_change || 0) < 0 
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {(item.price_change || 0) > 0 ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (item.price_change || 0) < 0 ? (
                        <ArrowDown className="w-3 h-3" />
                      ) : (
                        <TrendingUp className="w-3 h-3" />
                      )}
                      {Math.abs(item.price_change || 0).toFixed(1)}%
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-3xl font-bold text-gray-900">
                        {item.price ? `$${item.price.toFixed(0)}` : "—"}
                      </div>
                      <div className="text-sm text-gray-500">{item.currency}/{item.unit}</div>
                      {!item.price && (
                        <div className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded mt-1">
                          Missing Price Data
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Updated:</span>
                      <span className="font-medium text-green-700">
                        {new Date(item.last_updated).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Source:</span>
                      <span className="font-medium capitalize">{item.source}</span>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-3 border-green-200 text-green-900 hover:bg-green-50"
                      onClick={() => handleViewTrends(item, false)}
                    >
                      <TrendingUp className="h-4 w-4 mr-2" />
                      View Trends
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Market Summary */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-green-900">Market Summary</CardTitle>
          <CardDescription>Today's market performance overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-700">
                {filteredGrainPrices.filter((item: any) => (item.price_change || 0) > 0).length}
              </div>
              <div className="text-sm text-gray-600">Markets Up</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-700">
                {filteredGrainPrices.filter((item: any) => (item.price_change || 0) < 0).length}
              </div>
              <div className="text-sm text-gray-600">Markets Down</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700">
                {filteredGrainPrices.length > 0 
                  ? (filteredGrainPrices.reduce((sum: number, item: any) => sum + (item.price_change || 0), 0) / filteredGrainPrices.length).toFixed(1)
                  : 0}%
              </div>
              <div className="text-sm text-gray-600">Avg Change</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">
                {filteredMbarePrices.length}
              </div>
              <div className="text-sm text-gray-600">Mbare Items</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trends Dialog */}
      <Dialog open={trendDialogOpen} onOpenChange={setTrendDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Market Trends Analysis</DialogTitle>
          </DialogHeader>
          {loadingTrends ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : selectedItem && (
            <MarketTrendsChart
              itemName={selectedItem.crop || selectedItem.item}
              currentPrice={selectedItem.price || selectedItem.usd_price}
              currency={selectedItem.currency || 'USD'}
              unit={selectedItem.unit || selectedItem.quantity}
              trendData={historicalData.map(d => ({
                date: new Date(d.recorded_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                price: d.price || d.usd_price
              }))}
              priceChange7Day={calculateTrends(historicalData, selectedItem.price || selectedItem.usd_price).sevenDay}
              priceChange30Day={calculateTrends(historicalData, selectedItem.price || selectedItem.usd_price).thirtyDay}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MarketPrices;
