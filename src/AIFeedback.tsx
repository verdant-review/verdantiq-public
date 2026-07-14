
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Star, ThumbsUp, ThumbsDown } from "lucide-react";

interface AIFeedbackProps {
  interactionId: string;
  onFeedbackSubmit: (rating: number, comment?: string) => void;
  isSubmitting?: boolean;
}

const AIFeedback = ({ interactionId, onFeedbackSubmit, isSubmitting }: AIFeedbackProps) => {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (rating > 0) {
      onFeedbackSubmit(rating, comment.trim() || undefined);
      setSubmitted(true);
      setShowForm(false);
    }
  };

  const handleQuickFeedback = (quickRating: number) => {
    setRating(quickRating);
    onFeedbackSubmit(quickRating);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <ThumbsUp className="h-4 w-4" />
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  if (showForm) {
    return (
      <Card className="mt-2 bg-gray-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Rate this response:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="hover:scale-110 transition-transform"
                >
                  <Star
                    className={`h-4 w-4 ${
                      star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          
          <Textarea
            placeholder="Optional: How can we improve this response?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="text-sm"
            rows={2}
          />
          
          <div className="flex gap-2">
            <Button 
              size="sm" 
              onClick={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              className="bg-green-900 hover:bg-green-800"
            >
              Submit Feedback
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-gray-500">Was this helpful?</span>
      <button
        onClick={() => handleQuickFeedback(5)}
        className="hover:bg-green-100 p-1 rounded transition-colors"
        title="Good response"
      >
        <ThumbsUp className="h-3 w-3 text-green-600" />
      </button>
      <button
        onClick={() => handleQuickFeedback(2)}
        className="hover:bg-red-100 p-1 rounded transition-colors"
        title="Poor response"
      >
        <ThumbsDown className="h-3 w-3 text-red-600" />
      </button>
      <button
        onClick={() => setShowForm(true)}
        className="text-xs text-blue-600 hover:underline ml-1"
      >
        More feedback
      </button>
    </div>
  );
};

export default AIFeedback;
