import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2, CheckCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { SPECIES_OPTIONS } from "@/lib/i18n/livestock";

interface AuthPageProps {
  onAuthSuccess: () => void;
}

const PROVINCES = [
  "Bulawayo","Harare","Manicaland","Mashonaland Central","Mashonaland East",
  "Mashonaland West","Masvingo","Matabeleland North","Matabeleland South","Midlands"
];

const AuthPage = ({ onAuthSuccess }: AuthPageProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [region, setRegion] = useState("");

  const [farmingType, setFarmingType] = useState<"crop"|"livestock"|"mixed">("crop");
  const [farmLocation, setFarmLocation] = useState("");
  const [crops, setCrops] = useState("");
  const [livestock, setLivestock] = useState<string[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState("en");

  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const toggleLivestock = (s: string) => {
    setLivestock((prev) => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast({ title: "Welcome back!", description: "You have successfully signed in." });
      onAuthSuccess();
    } catch (error: any) {
      toast({ title: "Authentication Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Continue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName || !region) {
      toast({ title: "Missing details", description: "Please fill all fields.", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmLocation) {
      toast({ title: "Farm location required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { full_name: fullName, value_chain_stage: "farmer", region },
        }
      });
      if (error) throw error;

      if (data.user) {
        const cropArr = crops ? crops.split(",").map(c => c.trim()).filter(Boolean) : [];
        await supabase.from("profiles").update({
          farming_type: farmingType,
          livestock_of_interest: livestock,
          preferred_language: preferredLanguage,
          crops_of_interest: cropArr,
          region,
        } as any).eq("id", data.user.id);

        // Note: Farm creation is handled post-login by FarmRegistrationModal
        // so the farmer can name their farm themselves. We intentionally do
        // NOT auto-create a farm here to avoid duplicates.
      }
      setShowSuccessMessage(true);
    } catch (error: any) {
      toast({ title: "Authentication Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (showSuccessMessage) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <CardTitle className="text-2xl text-green-900">Account Created!</CardTitle>
          <CardDescription>Welcome to VerdantIQ.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 p-4 rounded-lg text-sm space-y-1">
            <p>Email: {email}</p>
            <p>Name: {fullName}</p>
            <p>Province: {region}</p>
            <p>Farming type: {farmingType}</p>
            {farmLocation && <p>Farm: {farmLocation}</p>}
          </div>
          <Button onClick={() => { setIsLogin(true); setShowSuccessMessage(false); setStep(1); }} className="w-full bg-green-700 hover:bg-green-800">
            Sign In Now
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-green-900">
            {isLogin ? "Welcome Back" : step === 1 ? "Create Account" : "Tell Us About Your Farm"}
          </CardTitle>
          <CardDescription>
            {isLogin ? "Sign in to your dashboard" : step === 1 ? "Step 1 of 2 — your account" : "Step 2 of 2 — your farm"}
          </CardDescription>
          {!isLogin && (
            <div className="flex justify-center gap-2 pt-2">
              <span className={`h-2 w-10 rounded-full ${step >= 1 ? "bg-green-600" : "bg-gray-300"}`} />
              <span className={`h-2 w-10 rounded-full ${step >= 2 ? "bg-green-600" : "bg-gray-300"}`} />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          ) : step === 1 ? (
            <form onSubmit={handleStep1Continue} className="space-y-4">
              <div className="space-y-2"><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Province</Label>
                <Select value={region} onValueChange={setRegion} required>
                  <SelectTrigger><SelectValue placeholder="Select your province" /></SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full bg-green-700 hover:bg-green-800">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label>Farming type</Label>
                <Select value={farmingType} onValueChange={(v: any) => setFarmingType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crop">Crops only</SelectItem>
                    <SelectItem value="livestock">Livestock only</SelectItem>
                    <SelectItem value="mixed">Mixed (crops + livestock)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Farm location</Label>
                <Input value={farmLocation} onChange={(e) => setFarmLocation(e.target.value)} placeholder="e.g., Goromonzi, Mashonaland East" required />
              </div>
              {(farmingType === "crop" || farmingType === "mixed") && (
                <div className="space-y-2">
                  <Label>Crops you grow</Label>
                  <Input value={crops} onChange={(e) => setCrops(e.target.value)} placeholder="Maize, tobacco, groundnuts" />
                </div>
              )}
              {(farmingType === "livestock" || farmingType === "mixed") && (
                <div className="space-y-2">
                  <Label>Livestock you keep</Label>
                  <div className="flex flex-wrap gap-2">
                    {SPECIES_OPTIONS.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={livestock.includes(s) ? "default" : "outline"}
                        onClick={() => toggleLivestock(s)}
                        className={livestock.includes(s) ? "bg-orange-600 hover:bg-orange-700" : ""}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Preferred language</Label>
                <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="sn">ChiShona</SelectItem>
                    <SelectItem value="nd">isiNdebele</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button type="submit" className="flex-1 bg-green-700 hover:bg-green-800" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <Button variant="link" onClick={() => { setIsLogin(!isLogin); setStep(1); }} className="text-green-700">
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
