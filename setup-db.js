require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setupDatabase() {
  try {
    const schema = fs.readFileSync('schema.sql', 'utf8');
    await pool.query(schema);
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_date DATE;');
    console.log('✅ Database schema yaratildi!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

setupDatabase();