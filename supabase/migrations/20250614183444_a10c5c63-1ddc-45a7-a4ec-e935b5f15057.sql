
-- Add walking option and fix rider verification system
ALTER TABLE rider_profiles 
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verification_documents jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bank_details jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{
  "app": true,
  "email": true, 
  "sms": false,
  "marketing": false
}',
ADD COLUMN IF NOT EXISTS delivery_preferences jsonb DEFAULT '{
  "max_distance": 15,
  "preferred_zones": [],
  "available_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
}';

-- Create rider reviews table
CREATE TABLE IF NOT EXISTS rider_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  delivery_rating integer CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
  communication_rating integer CHECK (communication_rating >= 1 AND communication_rating <= 5),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create rider achievements table
CREATE TABLE IF NOT EXISTS rider_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_type text NOT NULL,
  title text NOT NULL,
  description text,
  icon text DEFAULT 'award',
  progress integer DEFAULT 0,
  target integer DEFAULT 100,
  earned_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Create rider bank details table
CREATE TABLE IF NOT EXISTS rider_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  bvn text,
  is_verified boolean DEFAULT false,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Update vehicle_type enum to include walking
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type_enum') THEN
    CREATE TYPE vehicle_type_enum AS ENUM ('walking', 'bicycle', 'motorcycle', 'car', 'van');
  ELSE
    ALTER TYPE vehicle_type_enum ADD VALUE IF NOT EXISTS 'walking';
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE rider_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_bank_details ENABLE ROW LEVEL SECURITY;

-- RLS policies for rider_reviews
CREATE POLICY "Riders can view their own reviews" ON rider_reviews
  FOR SELECT USING (rider_id = auth.uid());

CREATE POLICY "Customers can view reviews they created" ON rider_reviews
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Customers can create reviews" ON rider_reviews
  FOR INSERT WITH CHECK (customer_id = auth.uid());

-- RLS policies for rider_achievements
CREATE POLICY "Riders can view their own achievements" ON rider_achievements
  FOR SELECT USING (rider_id = auth.uid());

CREATE POLICY "System can manage achievements" ON rider_achievements
  FOR ALL USING (true);

-- RLS policies for rider_bank_details
CREATE POLICY "Riders can manage their own bank details" ON rider_bank_details
  FOR ALL USING (rider_id = auth.uid());

-- Add triggers for updated_at
CREATE OR REPLACE TRIGGER update_rider_reviews_updated_at
  BEFORE UPDATE ON rider_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_rider_bank_details_updated_at
  BEFORE UPDATE ON rider_bank_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate rider rating from reviews
CREATE OR REPLACE FUNCTION calculate_rider_rating(rider_uuid uuid)
RETURNS TABLE(average_rating numeric, total_reviews integer)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    ROUND(AVG(rating)::numeric, 2) as average_rating,
    COUNT(*)::integer as total_reviews
  FROM rider_reviews 
  WHERE rider_id = rider_uuid;
$$;

-- Function to update rider profile rating when review is added
CREATE OR REPLACE FUNCTION update_rider_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_rating numeric;
  review_count integer;
BEGIN
  -- Calculate new rating
  SELECT average_rating, total_reviews 
  INTO new_rating, review_count
  FROM calculate_rider_rating(NEW.rider_id);
  
  -- Update rider profile
  UPDATE rider_profiles 
  SET 
    rating = COALESCE(new_rating, 0),
    updated_at = now()
  WHERE id = NEW.rider_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger for rating updates
CREATE OR REPLACE TRIGGER update_rider_rating_trigger
  AFTER INSERT OR UPDATE OR DELETE ON rider_reviews
  FOR EACH ROW EXECUTE FUNCTION update_rider_rating();
