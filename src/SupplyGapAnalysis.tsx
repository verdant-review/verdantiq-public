
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SupplyGapAnalysis = () => {
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
        description: "You'll be notified when our supply gap analysis is ready.",
      });
      setEmail("");
      setIsSubmitting(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <TrendingUp className="h-16 w-16 mx-auto text-primary" />
          <h1 className="text-4xl font-bold text-foreground">
            Our Supply Gap Analysis is Not Available Right Now
          </h1>
          <p className="text-xl text-muted-foreground">
            We're working hard to bring you something amazing. Sign up to get notified when we're ready!
          </p>
        </div>

        {/* Email Collection Form */}
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-center">
              <Mail className="h-5 w-5" />
              Get Notified When Ready
            </CardTitle>
            <CardDescription>
              Be the first to know when our AI-powered supply gap analysis launches
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
                {isSubmitting ? "Subscribing..." : "Notify Me When Ready"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Features Preview */}
        <div className="text-left space-y-4">
          <h3 className="text-xl font-semibold text-center">What's Coming</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-card p-4 rounded-lg border">
              <h4 className="font-medium mb-2">Market Opportunity Detection</h4>
              <p className="text-muted-foreground">Identify supply gaps and surplus markets across agricultural regions</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <h4 className="font-medium mb-2">Risk Assessment</h4>
              <p className="text-muted-foreground">Comprehensive risk analysis for supply chain decisions</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <h4 className="font-medium mb-2">Price Forecasting</h4>
              <p className="text-muted-foreground">Predict market prices based on supply-demand dynamics</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <h4 className="font-medium mb-2">Regional Insights</h4>
              <p className="text-muted-foreground">Detailed analysis across different agricultural regions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupplyGapAnalysis;
