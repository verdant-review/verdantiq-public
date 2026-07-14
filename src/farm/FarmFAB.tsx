import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FarmFABProps {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  className?: string;
}

const FarmFAB: React.FC<FarmFABProps> = ({ label, onClick, icon, className }) => {
  return (
    <Button
      onClick={onClick}
      className={cn(
        // Sit above the feedback widget (bottom-5 h-12) and the mobile bottom nav
        "fixed right-4 sm:right-5 bottom-24 sm:bottom-24 z-40 h-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 px-5 gap-2",
        className
      )}
      aria-label={label}
    >
      {icon ?? <Plus className="h-5 w-5" />}
      <span className="hidden sm:inline font-medium">{label}</span>
    </Button>
  );
};

export default FarmFAB;
