import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  allowedRoles: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-yellow-50 flex items-center justify-center">
        <div className="text-green-900 text-xl flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-900"></div>
          Loading access...
        </div>
      </div>
    );
  }

  // Check both user metadata and profile for value_chain_stage
  const userRole = (user as any)?.user_metadata?.value_chain_stage as string | undefined;
  const profileRole = profile?.value_chain_stage;
  const role = profileRole || userRole;
  
  const isAdmin = profile?.is_admin === true;
  const isAllowed = isAdmin || (!!role && allowedRoles.includes(role));

  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
