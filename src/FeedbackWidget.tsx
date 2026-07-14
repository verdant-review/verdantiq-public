import { useState } from "react";
import { z } from "zod";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquarePlus, Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const APP_VERSION = "1.0.0";

const feedbackSchema = z.object({
  feedback_type: z.enum(["bug", "idea", "praise", "other"]),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  message: z.string().trim().min(3, "Please write at least a few words").max(2000, "Maximum 2000 characters"),
});

let lastSubmitAt = 0;

interface FeedbackWidgetProps {
  /** If true, render even for anonymous users */
  allowAnonymous?: boolean;
}

const FeedbackWidget = ({ allowAnonymous = false }: FeedbackWidgetProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"bug" | "idea" | "praise" | "other">("idea");
  const [rating, setRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user && !allowAnonymous) return null;

  const handleSubmit = async () => {
    const now = Date.now();
    if (now - lastSubmitAt < 60_000) {
      toast.error("Please wait a moment before sending more feedback.");
      return;
    }

    const parsed = feedbackSchema.safeParse({
      feedback_type: type,
      rating: rating > 0 ? rating : null,
      message,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid feedback");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("platform_feedback").insert({
        user_id: user?.id ?? null,
        feedback_type: parsed.data.feedback_type,
        rating: parsed.data.rating,
        message: parsed.data.message,
        page_route: location.pathname,
        user_agent: navigator.userAgent.slice(0, 500),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        app_version: APP_VERSION,
      });

      if (error) throw error;

      lastSubmitAt = now;
      toast.success("Thanks! Your feedback helps us improve.");
      setMessage("");
      setRating(0);
      setType("idea");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 shadow-lg bg-green-900 hover:bg-green-800 text-white rounded-full h-12 px-4 gap-2"
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
        <span className="hidden sm:inline">Feedback</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share your feedback</DialogTitle>
            <DialogDescription>
              Tell us what's working, what's not, or what you'd love to see next.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">🐛 Bug / something broken</SelectItem>
                  <SelectItem value="idea">💡 Idea / feature request</SelectItem>
                  <SelectItem value="praise">❤️ Praise</SelectItem>
                  <SelectItem value="other">💬 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rate your experience (optional)</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n === rating ? 0 : n)}
                    className="hover:scale-110 transition-transform"
                    aria-label={`${n} star`}
                  >
                    <Star
                      className={`h-6 w-6 ${
                        n <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-msg">Your message</Label>
              <Textarea
                id="fb-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                rows={5}
                placeholder="What happened, or what would you like to see?"
              />
              <div className="text-xs text-muted-foreground text-right">
                {message.length} / 2000
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-green-900 hover:bg-green-800">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send feedback"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FeedbackWidget;
