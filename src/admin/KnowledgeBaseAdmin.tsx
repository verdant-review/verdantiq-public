import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Trash2, RefreshCw, Upload, FileText } from "lucide-react";

interface KbDocument {
  id: string;
  title: string;
  source: string | null;
  crop: string | null;
  region: string | null;
  language: string;
  page_count: number | null;
  chunk_count: number;
  tags: string[];
  created_at: string;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "sn", label: "Shona" },
  { value: "nd", label: "Ndebele" },
];

const KnowledgeBaseAdmin = () => {
  const { toast } = useToast();
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "",
    source: "",
    crop: "",
    region: "",
    language: "en",
    tags: "",
    notes: "",
  });

  const fetchDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kb_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load knowledge base", description: error.message, variant: "destructive" });
    } else {
      setDocs((data as KbDocument[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ title: "Select a PDF first", variant: "destructive" });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "PDF too large", description: "Max 15 MB per upload", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { data, error } = await supabase.functions.invoke("kb-ingest-pdf", {
        body: {
          title: form.title.trim(),
          source: form.source.trim() || undefined,
          crop: form.crop.trim() || null,
          region: form.region.trim() || null,
          language: form.language,
          tags,
          notes: form.notes.trim() || undefined,
          file_base64: b64,
          filename: file.name,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Document ingested",
        description: `${(data as any).pages} pages · ${(data as any).chunks} chunks embedded`,
      });
      setForm({ title: "", source: "", crop: "", region: "", language: "en", tags: "", notes: "" });
      setFile(null);
      fetchDocs();
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Ingestion failed",
        description: err.message || "Unable to process PDF",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its embeddings?`)) return;
    const { error } = await supabase.from("kb_documents").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Document removed" });
      fetchDocs();
    }
  };

  const totalChunks = docs.reduce((acc, d) => acc + (d.chunk_count || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{docs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Total chunks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChunks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Embedding model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">google/gemini-embedding-2</div>
            <div className="text-xs text-muted-foreground">3072-dim · multilingual</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload PDF farm guide
          </CardTitle>
          <CardDescription>
            Extract text, chunk, embed, and make it searchable for Mudhumeni Hungwe. Max 15 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>PDF file</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="AGRITEX Maize Production Guide 2023"
              />
            </div>
            <div>
              <Label>Source / publisher</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="AGRITEX, FAO, Seed Co..."
              />
            </div>
            <div>
              <Label>Crop (optional filter)</Label>
              <Input
                value={form.crop}
                onChange={(e) => setForm({ ...form, crop: e.target.value })}
                placeholder="Maize"
              />
            </div>
            <div>
              <Label>Region (optional filter)</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="Mashonaland East"
              />
            </div>
            <div>
              <Label>Language</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags (comma separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="pest,disease,fertilizer"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes about this document"
                rows={2}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={uploading}>
                {uploading ? "Ingesting..." : "Upload & embed"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Ingested documents</CardTitle>
            <CardDescription>These excerpts are injected into Mudhumeni Hungwe's answers.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDocs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Lang</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell>{d.source || "—"}</TableCell>
                    <TableCell>{d.crop || <span className="text-muted-foreground">any</span>}</TableCell>
                    <TableCell>{d.region || <span className="text-muted-foreground">any</span>}</TableCell>
                    <TableCell><Badge variant="outline">{d.language}</Badge></TableCell>
                    <TableCell className="text-right">{d.page_count ?? "—"}</TableCell>
                    <TableCell className="text-right">{d.chunk_count}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => deleteDoc(d.id, d.title)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!docs.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No documents yet. Upload a PDF guide to power Mudhumeni Hungwe with local knowledge.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeBaseAdmin;
