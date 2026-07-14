import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

interface Report {
  id: string;
  title: string;
  report_type: string;
  generated_at: string;
  content: any;
  scheme_id: string;
}

const SchemeReports: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [reports, setReports] = useState<Report[]>([]);

  const load = async () => {
    const { data: schemeRows } = await supabase.from("schemes").select("id").eq("organization_id", organizationId);
    const schemeIds = (schemeRows || []).map((s) => s.id);
    if (!schemeIds.length) { setReports([]); return; }
    const { data } = await supabase
      .from("scheme_reports")
      .select("id, title, report_type, generated_at, content, scheme_id")
      .in("scheme_id", schemeIds)
      .order("generated_at", { ascending: false })
      .limit(20);
    setReports(data || []);
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("scheme-reports-refresh", handler);
    return () => window.removeEventListener("scheme-reports-refresh", handler);
  }, [organizationId]);

  const download = (r: Report) => {
    const blob = new Blob([JSON.stringify(r.content, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.title.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (reports.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Reports</CardTitle></CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="border rounded p-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">{r.title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.report_type.replace("_", " ")} · {new Date(r.generated_at).toLocaleDateString()}
                  {r.content?.summary?.total_enrollments != null && ` · ${r.content.summary.total_enrollments} enrollments`}
                  {r.content?.summary?.total_hectares != null && ` · ${r.content.summary.total_hectares} ha`}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => download(r)}>
                <Download className="h-4 w-4 mr-1" /> JSON
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default SchemeReports;
