import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bot, User, Send, Lightbulb, MessageCircle, Loader2, Sparkles, History, Camera } from "lucide-react";
import DOMPurify from "dompurify";
import { useToast } from "@/hooks/use-toast";
import { useAIInteractions } from "@/hooks/useAIInteractions";
import { supabase } from "@/integrations/supabase/client";
import AIFeedback from "@/components/AIFeedback";
import ImageUploadButton from "@/components/ImageUploadButton";
import AIAdvisoryBadge from "@/components/AIAdvisoryBadge";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/hooks/useTelemetry";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  interactionId?: string;
}

const AIAgronomist = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { logInteraction, updateFeedback, isLogging } = useAIInteractions();
  const [sessionId] = useState(() => crypto.randomUUID());
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your AI agricultural advisor. I'm here to help you with farming questions, crop management, and seasonal planning across Zimbabwe and Africa. What would you like to know?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [dailyTip, setDailyTip] = useState<string | null>(null);
  const [isLoadingTip, setIsLoadingTip] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    "What's the best planting window for maize?",
    "How do I manage fall armyworm?",
    "Fertilizer requirements for soybeans?",
    "When should I plant cotton?",
    "How to improve soil fertility naturally?",
    "Best drought-resistant crops?"
  ];

  // Load conversation history
  useEffect(() => {
    const loadHistory = async () => {
      if (!user) {
        setIsLoadingHistory(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('ai_interactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          const historicalMessages: Message[] = data.flatMap((interaction) => [
            {
              id: `user-${interaction.id}`,
              role: "user" as const,
              content: interaction.user_message,
              timestamp: new Date(interaction.created_at)
            },
            {
              id: `ai-${interaction.id}`,
              role: "assistant" as const,
              content: interaction.ai_response,
              timestamp: new Date(interaction.created_at),
              interactionId: interaction.id
            }
          ]);

          setMessages([messages[0], ...historicalMessages]);
        }
      } catch (error) {
        console.error('Error loading conversation history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [user, sessionId]);

  // Load daily farming tip
  useEffect(() => {
    const loadDailyTip = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('farming-tips');
        if (error) throw error;
        if (data?.tip) {
          setDailyTip(data.tip);
        }
      } catch (error) {
        console.error('Error loading farming tip:', error);
        setDailyTip("Regular soil testing helps optimize fertilizer use and improve crop yields.");
      } finally {
        setIsLoadingTip(false);
      }
    };

    loadDailyTip();
  }, []);

  const sendMessage = async (messageContent: string, imageData?: string | null) => {
    if (!messageContent.trim() && !imageData) return;

    const displayContent = imageData 
      ? `📷 ${messageContent.trim() || "Analyze this crop image"}`
      : messageContent.trim();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: displayContent,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setPendingImage(null);
    setIsLoadingResponse(true);

    try {
      const recentMessages = messages
        .slice(-6)
        .filter(m => m.role !== "assistant" || !m.content.startsWith("Hello!"))
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      const requestBody: any = {
        message: messageContent || "Please analyze this crop/plant image for diseases or issues.",
        context: {
          session_id: sessionId,
          message_count: messages.length + 1,
          timestamp: new Date().toISOString(),
          conversation_history: recentMessages
        }
      };

      if (imageData) {
        requestBody.image = imageData;
      }

      trackEvent("feature_used", { feature: "ai_agronomist_query", has_image: !!imageData }, user?.id ?? null);
      const { data, error } = await supabase.functions.invoke('ai-agronomist', {
        body: requestBody
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(`AI service error: ${error.message}`);
      }

      if (!data) {
        throw new Error('Invalid response from AI service');
      }

      console.log('AI response received:', data);
      
      const aiResponse = data.message || data.response || (typeof data === 'string' ? data : JSON.stringify(data));
      
      const interactionData = await logInteraction(
        messageContent,
        aiResponse,
        {
          session_id: sessionId,
          message_count: messages.length + 1,
          response_type: "gemini",
          agronomist: data.agronomist || "Mudhumeni Hungwe"
        },
        sessionId
      );
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
        interactionId: interactionData?.id
      };

      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Error calling AI API:', error);
      
      toast({
        title: "Connection Error",
        description: "Unable to reach AI advisor. Please try again.",
        variant: "destructive"
      });
      
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment, or consult with your local agricultural extension officer for immediate assistance.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsLoadingResponse(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    sendMessage(question);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, pendingImage);
  };

  const handleFeedback = async (interactionId: string, rating: number, comment?: string) => {
    await updateFeedback(interactionId, rating, comment);
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">Mudhumeni Hungwe</h1>
              <p className="text-sm md:text-base text-muted-foreground">AI Agricultural Advisor</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Powered by Zyterra
            </Badge>
            {isLoadingHistory && (
              <Badge variant="outline" className="gap-1">
                <History className="h-3 w-3" />
                Loading History
              </Badge>
            )}
            {isLogging && (
              <Badge variant="outline">Training Mode Active</Badge>
            )}
          </div>
        </div>

        {/* AI Notice */}
        <Alert className="border-primary/20 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            <strong className="font-semibold">AI-Powered Agricultural Insights:</strong> Get real-time farming advice 
            tailored to Zimbabwean conditions. Your conversations are saved and help improve our service.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Interface */}
          <Card className="lg:col-span-2 border-border/50 shadow-lg">
            <CardHeader className="border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 bg-primary">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">AI Agricultural Advisor</CardTitle>
                    <AIAdvisoryBadge compact />
                  </div>
                  <CardDescription className="text-xs">Ask about crops, pests, soil, and more</CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              {/* Messages */}
              <ScrollArea className="h-[500px] md:h-[600px] p-4" ref={scrollAreaRef}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {message.role === "assistant" && (
                        <Avatar className="h-8 w-8 bg-primary flex-shrink-0">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      
                      <div className={`max-w-[85%] md:max-w-[80%] ${message.role === "user" ? "" : "space-y-2"}`}>
                        <div
                          className={`rounded-2xl px-4 py-3 ${
                            message.role === "user"
                              ? "bg-primary text-primary-foreground ml-auto"
                              : "bg-muted/50 text-foreground"
                          }`}
                        >
                          {message.role === "assistant" ? (
                            <div className="text-sm prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground">
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: DOMPurify.sanitize(
                                    message.content
                                      // Handle markdown headings
                                      .replace(/## (.*?)(\n|$)/g, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
                                      .replace(/# (.*?)(\n|$)/g, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
                                      // Handle bold and italic
                                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                      // Handle lists - numbered first, then bullets
                                      .replace(/\n(\d+)\. (.*?)(?=\n|$)/g, '<li class="ml-4">$2</li>')
                                      .replace(/(<li class="ml-4">.*?<\/li>)/s, '<ol class="list-decimal my-2 space-y-1">$1</ol>')
                                      .replace(/\n- (.*?)(?=\n|$)/g, '<li class="ml-4">$1</li>')
                                      .replace(/(<li class="ml-4">.*?<\/li>)/s, '<ul class="list-disc my-2 space-y-1">$1</ul>')
                                      // Handle paragraphs
                                      .replace(/\n\n/g, '</p><p class="my-2">')
                                      .replace(/^(?!<h|<ul|<ol|<li)/, '<p class="my-2">')
                                      .replace(/(?<!>)$/, '</p>')
                                      .replace(/<\/p><p class="my-2"><h/g, '</p><h')
                                      .replace(/<\/h3><p class="my-2">/g, '</h3>')
                                      .replace(/<\/h2><p class="my-2">/g, '</h2>'),
                                    {
                                      ALLOWED_TAGS: ['p','h2','h3','strong','em','ul','ol','li','br'],
                                      ALLOWED_ATTR: ['class'],
                                    }
                                  ),
                                }}
                              />
                            </div>
                          ) : (
                            <p className="text-sm">{message.content}</p>
                          )}
                          <span className="text-xs opacity-70 mt-2 block">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        {message.role === "assistant" && message.interactionId && (
                          <AIFeedback
                            interactionId={message.interactionId}
                            onFeedbackSubmit={(rating, comment) => 
                              handleFeedback(message.interactionId!, rating, comment)
                            }
                          />
                        )}
                      </div>
                      
                      {message.role === "user" && (
                        <Avatar className="h-8 w-8 bg-muted flex-shrink-0">
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                  
                  {isLoadingResponse && (
                    <div className="flex gap-3 justify-start">
                      <Avatar className="h-8 w-8 bg-primary flex-shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-muted/50 rounded-2xl px-4 py-3">
                        <div className="flex space-x-2">
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]"></div>
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              
              {/* Input Form */}
              <div className="border-t bg-muted/20 p-4">
                {pendingImage && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Camera className="h-3 w-3" />
                    Image attached — add a description or send to analyze
                  </div>
                )}
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <ImageUploadButton
                    onImageSelected={(img) => setPendingImage(img)}
                    disabled={isLoadingResponse}
                  />
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={pendingImage ? "Describe the issue (optional)..." : "Ask about crops, planting, pests..."}
                    disabled={isLoadingResponse}
                    className="flex-1 bg-background"
                  />
                  <Button 
                    type="submit" 
                    disabled={isLoadingResponse || (!input.trim() && !pendingImage)}
                    size="icon"
                    className="flex-shrink-0"
                  >
                    {isLoadingResponse ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Questions */}
            <Card className="border-border/50 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Quick Start
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quickQuestions.map((question, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    className="w-full justify-start h-auto py-2 px-3 text-xs font-normal text-left hover:bg-primary/10"
                    onClick={() => handleQuickQuestion(question)}
                    disabled={isLoadingResponse}
                  >
                    {question}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Daily Tip */}
            <Card className="border-border/50 shadow-lg bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Today's Farming Tip
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingTip ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tip...
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {dailyTip}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Expertise Areas */}
            <Card className="border-border/50 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Expertise Areas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Crop Planning",
                    "Pest Control",
                    "Disease Detection 📷",
                    "Soil Health",
                    "Weather",
                    "Fertilization",
                    "Seeds",
                    "Irrigation",
                    "Markets"
                  ].map((area, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {area}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAgronomist;
