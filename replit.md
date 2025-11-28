# Telegram Delivery Bot

## Overview
A Telegram bot for delivery and warehouse management built with Grammy framework and PostgreSQL (NeonDB). The bot manages deliveries, tracks warehouse inventory, and coordinates between masters (delivery personnel) and clients.

**Project Type:** Backend Service (Telegram Bot)  
**Language:** Node.js  
**Database:** PostgreSQL  
**Bot Framework:** Grammy

## Recent Changes
- **2024-11-28:** Initial project setup in Replit environment
  - Installed npm dependencies (dotenv, grammy, pg, xlsx)
  - Created PostgreSQL database and initialized schema
  - Configured environment secrets (BOT_TOKEN, DATABASE_URL, ADMIN_CHAT_ID, ADMIN_USER_ID)
  - Set up workflow to run bot via `node start.js`

## Project Architecture

### File Structure
```
├── bot.js                 # Main bot logic with Grammy handlers
├── start.js              # Entry point with environment/DB validation
├── setup-db.js           # Database schema initialization script
├── schema.sql            # PostgreSQL schema definitions
├── main.py               # Python test file (not used in main flow)
├── test_connection.py    # Database connection test utility
├── package.json          # Node.js dependencies
└── pyproject.toml        # Python dependencies
```

### Database Schema
The bot uses 4 main tables:
- **masters**: Delivery personnel with regions and Telegram IDs
- **warehouse**: Product inventory with quantities, prices, categories, and regions
- **clients**: Customer information
- **orders**: Delivery orders with status tracking, GPS coordinates, photos, and warranty info

### Key Features
1. **Admin Functions**
   - Add masters (delivery personnel)
   - Add products to warehouse
   - Import products from Excel files
   - View all orders and masters
   
2. **Master Functions**
   - Create new deliveries
   - View personal orders
   - Check warehouse inventory (region-filtered)
   - Add products to their region's warehouse

3. **Order Management**
   - Customer info collection
   - Product selection from warehouse
   - GPS location tracking
   - Photo documentation (before/after)
   - Digital signatures
   - Warranty tracking
   - Spare parts management

## Environment Variables
All stored as Replit Secrets:
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_CHAT_ID` - Admin's Telegram chat ID for notifications (supports comma-separated values for multiple admins)
- `ADMIN_USER_ID` - Admin's Telegram user ID for authentication (supports comma-separated values for multiple admins)

**Note:** ADMIN_CHAT_ID and ADMIN_USER_ID can contain multiple IDs separated by commas (e.g., "123456789,987654321") to allow multiple administrators.

## Running the Bot
The bot runs automatically via the configured workflow:
```bash
node start.js
```

The start script validates:
1. All required environment variables are set
2. Database connection is working
3. Required tables exist (creates them if missing)
4. Then launches the bot

### Manual Setup (if needed)
If dependencies are missing, run:
```bash
npm install
```

## Development Notes
- Bot uses in-memory sessions for conversation state management
- Excel import supports multiple column name formats (English/Uzbek)
- Regional warehouse management allows masters to manage their own region's inventory
- Admin can manage all regions and view global statistics
