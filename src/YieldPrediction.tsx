import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Mail, LineChart, Download, TrendingUp, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { trackEvent } from "@/hooks/useTelemetry";
import AIAdvisoryBadge from "@/components/AIAdvisoryBadge";

// Raw CSV data converted to JavaScript object (2025-2030 predictions)
const yieldData = [
  { year: 2025, Cassava: 46399.215, Maize: 10556.075, Potatoes: 22165.59, "Rice": 5412.0205, Sorghum: 14035.685, Soybeans: 22899.432, "Sweet potatoes": 24042.93, Wheat: 25037.549 },
  { year: 2026, Cassava: 46112.688, Maize: 10552.748, Potatoes: 22576.447, "Rice": 3898.7864, Sorghum: 14818.677, Soybeans: 23325.604, "Sweet potatoes": 23744.09, Wheat: 23710.924 },
  { year: 2027, Cassava: 46018.78, Maize: 8812.747, Potatoes: 22840.193, "Rice": 4991.507, Sorghum: 12309.177, Soybeans: 21789.344, "Sweet potatoes": 23936.35, Wheat: 24042.93 },
  { year: 2028, Cassava: 46017.277, Maize: 11560.087, Potatoes: 22836.703, "Rice": 3055.2156, Sorghum: 14778.346, Soybeans: 21859.49, "Sweet potatoes": 23976.54, Wheat: 24582.45 },
  { year: 2029, Cassava: 46028.72, Maize: 11552.288, Potatoes: 22840.193, "Rice": 2693.7297, Sorghum: 14726.895, Soybeans: 21962.186, "Sweet potatoes": 25120.105, Wheat: 23821.271 },
  { year: 2030, Cassava: 45935.996, Maize: 13126.147, Potatoes: 22165.59, "Rice": 3816.9714, Sorghum: 15693.833, Soybeans: 22964.174, "Sweet potatoes": 24055.426, Wheat: 23657.307 }
];

// Use original data in hg/ha
const yieldDataDisplay = yieldData;

// Key crops for Zimbabwe food security
const keyCrops = yieldDataDisplay.map(item => ({
  year: item.year,
  Maize: item.Maize,
  Sorghum: item.Sorghum
}));

const YieldPrediction = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    // Simulate API call to save email
    setTimeout(() => {
      toast({
        title: "Success!",
        description: "You'll be notified when our yield prediction engine is ready.",
      });
      setEmail("");
      setIsSubmitting(false);
    }, 1000);
  };

  const handleDownloadReport = () => {
    trackEvent("feature_used", { feature: "yield_report_download" });
    window.open('https://drive.google.com/file/d/1nOyDNHOQko-t_yzkk2-04gD46vEkh8s5/view?usp=sharing', '_blank');
    toast({
      title: "Opening Report",
      description: "The full report is opening in a new tab.",
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <TrendingUp className="h-12 w-12 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">
              Zimbabwe Yield Prediction Results
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Future yield predictions for Zimbabwe's key agricultural crops (2025-2030)
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="all-crops">All Crops</TabsTrigger>
            <TabsTrigger value="key-crops">Key Crops</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Model Performance Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Model Performance Summary
                  </CardTitle>
                  <AIAdvisoryBadge compact />
                </div>
                <CardDescription>
                  First-generation Zimbabwe yield prediction model evaluation (2014-2022)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                    <div className="text-2xl font-bold text-destructive">32.74%</div>
                    <div className="text-sm text-muted-foreground">Mean Absolute Percentage Error (MAPE)</div>
                  </div>
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="text-2xl font-bold text-primary">8 Crops</div>
                    <div className="text-sm text-muted-foreground">Analyzed in Study</div>
                  </div>
                  <div className="p-4 bg-secondary/50 rounded-lg border">
                    <div className="text-2xl font-bold text-foreground">6 Years</div>
                    <div className="text-sm text-muted-foreground">Prediction Timeline (2025-2030)</div>
                  </div>
                </div>

                {/* Download Report Button */}
                <div className="pt-4 border-t">
                  <Button onClick={handleDownloadReport} className="w-full md:w-auto">
                    <Download className="h-4 w-4 mr-2" />
                    Download Full Report: "An Econometric and Contextual Validation of a Crop Yield Prediction Model for Zimbabwe"
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Key Crops Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Zimbabwe Food Security Crops: Maize & Sorghum Trends</CardTitle>
                <CardDescription>
                  Predicted yields for crops critical to Zimbabwe's food security (hectograms per hectare)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={keyCrops}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" />
                      <YAxis />
                      <Tooltip 
                        formatter={(value, name) => [`${value} hg/ha`, name]}
                        labelFormatter={(year) => `Year: ${year}`}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="Maize" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Sorghum" 
                        stroke="hsl(var(--secondary))" 
                        strokeWidth={3}
                        dot={{ fill: "hsl(var(--secondary))", strokeWidth: 2 }}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all-crops" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Crop Yield Predictions (2025-2030)</CardTitle>
                <CardDescription>
                  Comprehensive view of predicted yields across all analyzed crops (hectograms per hectare)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart data={yieldDataDisplay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" />
                      <YAxis />
                        <Tooltip 
                          formatter={(value, name) => [`${value} hg/ha`, name]}
                          labelFormatter={(year) => `Year: ${year}`}
                        />
                      <Legend />
                      <Line type="monotone" dataKey="Cassava" stroke="#8884d8" strokeWidth={2} />
                      <Line type="monotone" dataKey="Maize" stroke="#82ca9d" strokeWidth={2} />
                      <Line type="monotone" dataKey="Potatoes" stroke="#ffc658" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rice" stroke="#ff7300" strokeWidth={2} />
                      <Line type="monotone" dataKey="Sorghum" stroke="#00ff88" strokeWidth={2} />
                      <Line type="monotone" dataKey="Soybeans" stroke="#0088fe" strokeWidth={2} />
                      <Line type="monotone" dataKey="Sweet potatoes" stroke="#ff0088" strokeWidth={2} />
                      <Line type="monotone" dataKey="Wheat" stroke="#8800ff" strokeWidth={2} />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="key-crops" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Maize Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle>Maize Yield Analysis</CardTitle>
                  <CardDescription>Zimbabwe's primary staple crop</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={keyCrops}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value} hg/ha`, "Maize"]} />
                        <Bar dataKey="Maize" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Sorghum Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle>Sorghum Yield Analysis</CardTitle>
                  <CardDescription>Drought-resistant alternative grain</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={keyCrops}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value} hg/ha`, "Sorghum"]} />
                        <Bar dataKey="Sorghum" fill="hsl(var(--secondary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            {/* VerdantIQ Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Improving Zimbabwe's Yield Predictions: A Performance Review and Our Next Leap</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-left">
                <p className="text-foreground">
                  At VerdantIQ, we don't hide from hard truths — we use them as launchpads.
                </p>
                
                <p className="text-muted-foreground">
                  Our mission has always been clear: build the most intelligent agricultural prediction system Africa has ever seen. 
                  And when we tested our first-generation Zimbabwe yield model against real data from 2014 to 2022, we uncovered 
                  a painful reality: the model's Mean Absolute Percentage Error (MAPE) was <strong className="text-destructive">32.74%</strong>.
                </p>

                <p className="text-muted-foreground">
                  That's not good enough. Not for us. Not for Zimbabwe.
                </p>

                <p className="text-muted-foreground">
                  The reason? Traditional statistical models fail when the world gets messy. Climate shocks. Currency volatility. 
                  Policy shifts. These are not edge cases in Zimbabwe — they are the rule. And our early model, though groundbreaking 
                  in structure, couldn't fully capture that chaos.
                </p>

                <div className="pt-4">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Our Next Leap Forward</h3>
                  <p className="text-muted-foreground mb-4">
                    We are not tweaking at the margins. We are reengineering VerdantIQ's prediction engine from the ground up to 
                    mirror reality — not just spreadsheets. Here's how:
                  </p>

                  <div className="space-y-4">
                    <div className="bg-card p-4 rounded-lg border">
                      <h4 className="font-medium mb-2 text-foreground">🌍 Integrating Real-World Shocks</h4>
                      <p className="text-muted-foreground text-sm">
                        Our new model ingests live external signals: El Niño / La Niña cycles, rainfall anomalies, inflation trends, 
                        and sudden policy moves. Agriculture does not exist in a vacuum — now neither does our prediction system.
                      </p>
                    </div>

                    <div className="bg-card p-4 rounded-lg border">
                      <h4 className="font-medium mb-2 text-foreground">🤖 Hybrid Modeling</h4>
                      <p className="text-muted-foreground text-sm">
                        The future is not one method. We are merging the strength of statistical models with the adaptability 
                        of machine learning. This hybrid system won't just fit data — it will learn from shocks, outliers, 
                        and non-linear shifts.
                      </p>
                    </div>

                    <div className="bg-card p-4 rounded-lg border">
                      <h4 className="font-medium mb-2 text-foreground">🌾 Focus on the Crops That Matter Most</h4>
                      <p className="text-muted-foreground text-sm">
                        Zimbabwe's food security lives and dies with maize and sorghum. These will be our moonshot test cases. 
                        When we can forecast these with high fidelity, the rest of the crop models will follow.
                      </p>
                    </div>

                    <div className="bg-card p-4 rounded-lg border">
                      <h4 className="font-medium mb-2 text-foreground">⚡ Continuous Intelligence</h4>
                      <p className="text-muted-foreground text-sm">
                        Static reports belong to the past. Our next-gen engine will monitor, adjust, and re-predict in real time — 
                        reflecting the ground truth as it evolves. Farmers and policymakers won't just get predictions; 
                        they'll get a living, breathing model that adapts alongside reality.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Why This Matters</h3>
                  <p className="text-muted-foreground">
                    This isn't academic. It's existential. Zimbabwe loses billions in potential yield every decade because 
                    farming decisions are made blind. VerdantIQ exists to remove that blindfold.
                  </p>
                  
                  <p className="text-muted-foreground mt-2">
                    We are building the system that will transform agriculture from reactive to predictive, from fragile to antifragile.
                  </p>

                  <p className="text-foreground mt-2 font-medium">
                    And this is just the beginning.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Email Collection Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Get Updates on Our Progress
                </CardTitle>
                <CardDescription>
                  Be the first to know when our next-generation yield prediction engine launches
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Subscribing..." : "Stay Updated"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default YieldPrediction;