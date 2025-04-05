/*
  # Create Songs Table and Security Policies

  1. New Tables
    - `songlist_db`
      - `id` (uuid, primary key)
      - `title` (text)
      - `artist` (text)
      - `url` (text)
      - `cover_url` (text)
      - `duration` (int4, default: 0)
      - `created_at` (timestamptz, default: now())

  2. Security
    - Enable RLS
    - Add policies for public read access
*/

CREATE TABLE IF NOT EXISTS songlist_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  artist text,
  url text,
  cover_url text,
  duration int4 DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE songlist_db ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Allow public read access"
  ON songlist_db
  FOR SELECT
  TO public
  USING (true);