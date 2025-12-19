require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setupDatabase() {
  try {
    const schema = fs.readFileSync('schema.sql', 'utf8');
    await pool.query(schema);
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_date DATE;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS master_current_lat DOUBLE PRECISION;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS master_current_lng DOUBLE PRECISION;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS warranty_expired BOOLEAN DEFAULT NULL;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS spare_part_sent BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS spare_part_received BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS spare_part_photo TEXT;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS completion_gps_lat DOUBLE PRECISION;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS completion_gps_lng DOUBLE PRECISION;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS master_telegram_id BIGINT;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS barcode TEXT;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS completion_barcode TEXT;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION DEFAULT 0;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_fee NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS work_type TEXT DEFAULT NULL;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS work_fee NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_total NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_payment NUMERIC DEFAULT 0;');
    console.log('✅ Database schema yaratildi!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

setupDatabase();