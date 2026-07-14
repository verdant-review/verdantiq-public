import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, Phone, Check, Loader2, ExternalLink } from "lucide-react";

const VERDANTIQ_WHATSAPP_NUMBER = "+263 77 591 9996";
const VERDANTIQ_WHATSAPP_LINK = "https://wa.me/263775919996";
import { trackEvent } from "@/hooks/useTelemetry";

const WhatsAppConnect = () => {
  const { user } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLinked, setIsLinked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    whatsapp_enabled: false,
    price_alerts_enabled: true,
    weather_alerts_enabled: true,
    task_reminders_enabled: true,
    language: "en",
  });

  useEffect(() => {
    if (!user?.id) return;
    const fetchPreferences = async () => {
      const { data } = await supabase
        .from("messaging_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setPhoneNumber(data.phone_number || "");
        setIsLinked(!!data.whatsapp_enabled && !!data.phone_number);
        setPreferences({
          whatsapp_enabled: data.whatsapp_enabled ?? false,
          price_alerts_enabled: data.price_alerts_enabled ?? true,
          weather_alerts_enabled: data.weather_alerts_enabled ?? true,
          task_reminders_enabled: data.task_reminders_enabled ?? true,
          language: data.language || "en",
        });
      }
      setIsLoading(false);
    };
    fetchPreferences();
  }, [user?.id]);

  const handleLinkWhatsApp = async () => {
    if (!user?.id || !phoneNumber.trim()) {
      toast.error("Please enter a valid phone number");
      return;
    }

    const cleaned = phoneNumber.startsWith("+") ? phoneNumber : `+263${phoneNumber.replace(/^0/, "")}`;

    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from("messaging_preferences")
        .select("id")
        .eq("user_id", user.id)
        .single();

      const payload = {
        user_id: user.id,
        phone_number: cleaned,
        whatsapp_enabled: true,
        preferred_channel: "whatsapp",
        language: preferences.language,
        price_alerts_enabled: preferences.price_alerts_enabled,
        weather_alerts_enabled: preferences.weather_alerts_enabled,
        task_reminders_enabled: preferences.task_reminders_enabled,
      };

      if (existing) {
        await supabase.from("messaging_preferences").update(payload).eq("user_id", user.id);
      } else {
        await supabase.from("messaging_preferences").insert(payload);
      }

      // Also link the WhatsApp session if one exists for this phone
      await supabase
        .from("whatsapp_sessions")
        .update({ user_id: user.id })
        .eq("phone_number", `whatsapp:${cleaned}`);

      setIsLinked(true);
      trackEvent("feature_used", { feature: "whatsapp_linked" }, user.id);
      toast.success("WhatsApp linked successfully! You'll receive alerts on this number.");
    } catch (error) {
      console.error("Error linking WhatsApp:", error);
      toast.error("Failed to link WhatsApp. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePreferences = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      await supabase
        .from("messaging_preferences")
        .update({
          ...preferences,
          language: preferences.language,
        })
        .eq("user_id", user.id);
      toast.success("Preferences updated!");
    } catch (error) {
      toast.error("Failed to update preferences.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          WhatsApp Integration
        </CardTitle>
        <CardDescription>
          Connect your WhatsApp to receive market prices, weather alerts, and farming tips directly on your phone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* VerdantIQ WhatsApp number callout */}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Message VerdantIQ on WhatsApp
          </p>
          <p className="text-muted-foreground mt-1">
            Save our number to chat with Mudhumeni Hungwe and access prices, weather, NDVI and more:
          </p>
          <a
            href={VERDANTIQ_WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-primary font-semibold hover:underline"
          >
            {VERDANTIQ_WHATSAPP_NUMBER}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Phone number & link */}
        <div className="space-y-3">
          <Label htmlFor="wa-phone" className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Phone Number
          </Label>
          <div className="flex gap-2">
            <Input
              id="wa-phone"
              placeholder="+263 77 123 4567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={isLinked}
              className="flex-1"
            />
            {isLinked ? (
              <Button variant="outline" disabled>
                <Check className="h-4 w-4 mr-1" /> Linked
              </Button>
            ) : (
              <Button onClick={handleLinkWhatsApp} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link WhatsApp"}
              </Button>
            )}
          </div>
          {isLinked && (
            <p className="text-xs text-muted-foreground">
              ✅ Your WhatsApp is connected. You can also message us directly on WhatsApp to interact with VerdantIQ.
            </p>
          )}
        </div>

        {/* Language preference */}
        <div className="space-y-2">
          <Label>Preferred Language</Label>
          <Select
            value={preferences.language}
            onValueChange={(v) => setPreferences((p) => ({ ...p, language: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="sn">Shona</SelectItem>
              <SelectItem value="nd">Ndebele</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alert toggles */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Notification Preferences</Label>

          <div className="flex items-center justify-between">
            <Label htmlFor="price-alerts" className="text-sm font-normal">
              📈 Market price alerts
            </Label>
            <Switch
              id="price-alerts"
              checked={preferences.price_alerts_enabled}
              onCheckedChange={(v) => setPreferences((p) => ({ ...p, price_alerts_enabled: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="weather-alerts" className="text-sm font-normal">
              🌦️ Weather alerts
            </Label>
            <Switch
              id="weather-alerts"
              checked={preferences.weather_alerts_enabled}
              onCheckedChange={(v) => setPreferences((p) => ({ ...p, weather_alerts_enabled: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="task-reminders" className="text-sm font-normal">
              ⏰ Task reminders
            </Label>
            <Switch
              id="task-reminders"
              checked={preferences.task_reminders_enabled}
              onCheckedChange={(v) => setPreferences((p) => ({ ...p, task_reminders_enabled: v }))}
            />
          </div>
        </div>

        {isLinked && (
          <Button onClick={handleUpdatePreferences} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Preferences
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppConnect;
