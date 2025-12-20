require('dotenv').config({ override: false });
const fs = require('fs');
const { Pool } = require('pg');

async function start() {
  console.log('🚀 Starting Telegram Delivery Bot...\n');

  // Check required environment variables
  const requiredEnvVars = {
    'BOT_TOKEN': 'Telegram bot token from @BotFather',
    'DATABASE_URL': 'PostgreSQL database connection string',
    'ADMIN_CHAT_ID': 'Telegram chat ID for admin notifications',
    'ADMIN_USER_ID': 'Telegram user ID of the administrator'
  };

  const missingVars = [];
  for (const [varName, description] of Object.entries(requiredEnvVars)) {
    if (!process.env[varName]) {
      missingVars.push(`  ❌ ${varName} - ${description}`);
    } else {
      console.log(`  ✅ ${varName} is set`);
    }
  }

  if (missingVars.length > 0) {
    console.warn('\n⚠️  Some environment variables may not be set:\n');
    console.warn(missingVars.join('\n'));
    console.warn('\n📝 If the bot isn\'t responding, please set these in the Secrets tab.\n');
  }

  // Check database connection and schema
  console.log('\n📊 Checking database connection...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    await pool.query('SELECT 1');
    console.log('  ✅ Database connection successful');

    // Check if tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('masters', 'warehouse', 'orders', 'clients')
      ORDER BY table_name;
    `);

    const existingTables = tablesResult.rows.map(row => row.table_name);
    const requiredTables = ['masters', 'warehouse', 'orders', 'clients'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      console.log(`\n  ⚠️  Missing tables: ${missingTables.join(', ')}`);
      console.log('  🔧 Running database setup...');
      
      const schema = fs.readFileSync('schema.sql', 'utf8');
      await pool.query(schema);
      
      console.log('  ✅ Database schema created successfully');
    } else {
      console.log('  ✅ All required tables exist');
    }

    // Ensure product_date column exists
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_date DATE;');
    console.log('  ✅ Database schema up to date');

    await pool.end();

    // Start the bot
    console.log('\n🤖 Starting bot...\n');
    require('./bot.js');

  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    console.error('\n💡 If you haven\'t created a database yet:');
    console.error('   1. Go to Tools → Database in the Replit sidebar');
    console.error('   2. Create a PostgreSQL database');
    console.error('   3. The DATABASE_URL will be set automatically\n');
    process.exit(1);
  }
}

start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
