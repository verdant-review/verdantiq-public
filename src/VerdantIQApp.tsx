
import { useState } from "react";
import Navigation from "./Navigation";
import MarketPrices from "./MarketPrices";
import SupplyGapAnalysis from "./SupplyGapAnalysis";
import WeatherModule from "./WeatherModule";
import YieldPrediction from "./YieldPrediction";
import AIAgronomist from "./AIAgronomist";

const VerdantIQApp = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  const renderContent = () => {
    switch (activeTab) {
      case "market-prices":
        return <MarketPrices />;
      case "supply-analysis":
        return <SupplyGapAnalysis />;
      case "weather":
        return <WeatherModule />;
      case "yield-prediction":
        return <YieldPrediction />;
      case "ai-agronomist":
        return <AIAgronomist />;
      default:
        return null; // Dashboard will be rendered by Index page
    }
  };

  if (activeTab === "dashboard") {
    return null; // Let the Index page handle dashboard
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-yellow-50">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto px-4 py-8">
        {renderContent()}
      </main>
      
      {/* Footer */}
      <footer className="bg-green-900 text-green-100 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h4 className="text-xl font-bold text-yellow-400 mb-2">Africa's Agricultural Intelligence Engine</h4>
            <p className="text-sm">Empowering Zimbabwe's Agricultural Future</p>
            <p className="text-xs mt-4 text-green-300">
              © 2024 Africa's Agricultural Intelligence Engine. Transforming Zimbabwe's agriculture through intelligent data.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default VerdantIQApp;
