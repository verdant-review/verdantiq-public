
-- Remove vegetable items from market_prices (grain prices only)
DELETE FROM market_prices 
WHERE LOWER(crop) IN ('tomatoes', 'onions', 'cabbage', 'carrots', 'potatoes', 'green beans', 'butternut', 'spinach');

-- Remove vegetable items from market_price_history
DELETE FROM market_price_history 
WHERE LOWER(crop) IN ('tomatoes', 'onions', 'cabbage', 'carrots', 'potatoes', 'green beans', 'butternut', 'spinach');
