-- Delete garbage data from market_prices (non-crop entries)
DELETE FROM market_prices 
WHERE crop NOT IN ('Maize', 'Wheat', 'Soybeans', 'Sugar Beans', 'Tomatoes', 'Onions', 'Carrots', 'Cabbage', 'Potatoes', 'Groundnuts', 'Sunflower', 'Sorghum', 'Cotton', 'Tobacco', 'Rice', 'Barley', 'Millet');

-- Delete garbage data from market_price_history (non-crop entries)
DELETE FROM market_price_history 
WHERE crop NOT IN ('Maize', 'Wheat', 'Soybeans', 'Sugar Beans', 'Tomatoes', 'Onions', 'Carrots', 'Cabbage', 'Potatoes', 'Groundnuts', 'Sunflower', 'Sorghum', 'Cotton', 'Tobacco', 'Rice', 'Barley', 'Millet');