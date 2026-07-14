
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { Menu, X, TrendingUp, BarChart3, CloudSun, Wheat, MessageSquare, Settings, LogOut, Shield, Truck } from "lucide-react";
import ProfileModal from "./ProfileModal";

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Navigation = ({ activeTab, onTabChange }: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: TrendingUp },
    { id: "my-farm", label: "My Farm", icon: Wheat },
    { id: "ai-agronomist", label: "AI Agronomist", icon: MessageSquare },
    { id: "market-prices", label: "Market Prices", icon: BarChart3 },
    { id: "supply-analysis", label: "Supply Analysis", icon: BarChart3 },
    { id: "weather", label: "Weather", icon: CloudSun },
    { id: "yield-prediction", label: "Yield Prediction", icon: Wheat },
  ];

  // Check both user metadata and profile for value_chain_stage
  const userRole = (user as any)?.user_metadata?.value_chain_stage as string | undefined;
  const profileRole = profile?.value_chain_stage;
  const role = profileRole || userRole;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleAdminClick = () => {
    navigate('/admin');
  };

  return (
    <nav className="bg-green-900 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <img 
              src="/lovable-uploads/a1c51b73-ae65-4b26-96b4-26659d0f86d8.png" 
              alt="VerdantIQ Logo" 
              className="w-[100px] h-auto"
            />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "secondary" : "ghost"}
                  className={`text-white hover:bg-green-800 text-sm px-2 xl:px-4 ${
                    activeTab === item.id ? "bg-green-700" : ""
                  }`}
                  onClick={() => {
                    if (item.id === "my-farm") {
                      navigate('/my-farm');
                    } else {
                      onTabChange(item.id);
                    }
                  }}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Button>
              );
            })}

            {user && (role === 'logistics' || profile?.is_admin) && (
              <Button
                variant="ghost"
                className="text-white hover:bg-green-800"
                onClick={() => navigate('/logistics')}
              >
                <Truck className="h-4 w-4 mr-2" /> Logistics
              </Button>
            )}
          </div>

          {/* User Menu */}
          <div className="hidden lg:flex items-center space-x-4">
            {user ? (
              <>
                {profile?.is_admin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-green-900"
                    onClick={handleAdminClick}
                  >
                    <Shield className="h-4 w-4 mr-1" />
                    Admin
                  </Button>
                )}
                
                <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setIsProfileModalOpen(true)}>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-green-700 text-white">
                      {profile?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm">
                    <div className="font-medium">{profile?.full_name || 'User'}</div>
                    <div className="text-green-300 text-xs">{profile?.value_chain_stage}</div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="text-white hover:bg-green-800"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-green-900"
                onClick={() => navigate('/auth')}
              >
                Sign In / Register
              </Button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-white hover:bg-green-800"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-green-800">
            <div className="flex flex-col space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant={activeTab === item.id ? "secondary" : "ghost"}
                    className={`justify-start text-white hover:bg-green-800 ${
                      activeTab === item.id ? "bg-green-700" : ""
                    }`}
                    onClick={() => {
                      if (item.id === "my-farm") {
                        navigate('/my-farm');
                      } else {
                        onTabChange(item.id);
                      }
                      setIsMenuOpen(false);
                    }}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                );
              })}

              {user && (role === 'logistics' || profile?.is_admin) && (
                <Button
                  variant="ghost"
                  className="justify-start w-full text-white hover:bg-green-800"
                  onClick={() => {
                    navigate('/logistics');
                    setIsMenuOpen(false);
                  }}
                >
                  <Truck className="h-4 w-4 mr-2" /> Logistics
                </Button>
              )}
              
              <div className="border-t border-green-800 pt-2 mt-2">
                {user ? (
                  <>
                    <div className="flex items-center space-x-2 px-3 py-2 cursor-pointer" onClick={() => setIsProfileModalOpen(true)}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-green-700 text-white">
                          {profile?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-sm">
                        <div className="font-medium">{profile?.full_name || 'User'}</div>
                        <div className="text-green-300 text-xs">{profile?.value_chain_stage}</div>
                      </div>
                    </div>
                    
                    {profile?.is_admin && (
                      <Button
                        variant="ghost"
                        className="justify-start w-full text-yellow-400 hover:bg-green-800"
                        onClick={() => {
                          handleAdminClick();
                          setIsMenuOpen(false);
                        }}
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        Admin Dashboard
                      </Button>
                    )}
                    
                    <Button
                      variant="ghost"
                      className="justify-start w-full text-white hover:bg-green-800"
                      onClick={handleSignOut}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    className="justify-start w-full border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-green-900"
                    onClick={() => {
                      navigate('/auth');
                      setIsMenuOpen(false);
                    }}
                  >
                    Sign In / Register
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <ProfileModal 
        open={isProfileModalOpen} 
        onOpenChange={setIsProfileModalOpen}
      />
    </nav>
  );
};

export default Navigation;
