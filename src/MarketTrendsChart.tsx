import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrendData {
  date: string;
  price: number;
}

interface MarketTrendsChartProps {
  itemName: string;
  currentPrice: number;
  currency: string;
  unit: string;
  trendData: TrendData[];
  priceChange7Day?: number;
  priceChange30Day?: number;
}

const MarketTrendsChart = ({ 
  itemName, 
  currentPrice, 
  currency, 
  unit,
  trendData,
  priceChange7Day = 0,
  priceChange30Day = 0
}: MarketTrendsChartProps) => {
  
  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-emerald-600" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0) return "text-emerald-600";
    if (change < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Current Price Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{itemName}</span>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {currency === 'USD' ? '$' : currency} {currentPrice.toFixed(2)}/{unit}
            </Badge>
          </CardTitle>
          <CardDescription>Price trends and analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* 7-Day Change */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">7-Day Change</p>
              <div className={`flex items-center gap-2 text-lg font-semibold ${getTrendColor(priceChange7Day)}`}>
                {getTrendIcon(priceChange7Day)}
                <span>{priceChange7Day > 0 ? '+' : ''}{priceChange7Day.toFixed(1)}%</span>
              </div>
            </div>

            {/* 30-Day Change */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">30-Day Change</p>
              <div className={`flex items-center gap-2 text-lg font-semibold ${getTrendColor(priceChange30Day)}`}>
                {getTrendIcon(priceChange30Day)}
                <span>{priceChange30Day > 0 ? '+' : ''}{priceChange30Day.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
          <CardDescription>Last 30 days of price data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  stroke="hsl(var(--foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem'
                  }}
                  formatter={(value: number) => [`${currency === 'USD' ? '$' : currency}${value.toFixed(2)}`, 'Price']}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Price"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Market Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Market Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {priceChange7Day > 5 && (
              <p className="flex items-center gap-2 text-emerald-700">
                <TrendingUp className="h-4 w-4" />
                <span>Strong upward momentum over the past week. Consider selling if you have surplus.</span>
              </p>
            )}
            {priceChange7Day < -5 && (
              <p className="flex items-center gap-2 text-red-700">
                <TrendingDown className="h-4 w-4" />
                <span>Price declining this week. May be a good time to buy for future use.</span>
              </p>
            )}
            {Math.abs(priceChange7Day) <= 5 && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Minus className="h-4 w-4" />
                <span>Stable prices this week. Market conditions are steady.</span>
              </p>
            )}
            
            {trendData.length > 0 && (
              <p className="text-muted-foreground">
                Based on {trendData.length} days of data. Prices are subject to market conditions and seasonal variations.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketTrendsChart;
