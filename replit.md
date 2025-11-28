# Telegram Delivery Bot

## Overview
A comprehensive Telegram bot for managing delivery operations, built with Grammy (Telegram bot framework) and PostgreSQL. The bot handles order management, warehouse inventory, master (delivery person) management, and supports Excel imports for bulk product updates.

**Current State**: ✅ Fully configured and running
- **Language**: Node.js (JavaScript)
- **Framework**: Grammy (Telegram bot framework)
- **Database**: PostgreSQL (NeonDB)
- **Dependencies**: dotenv, grammy, pg, xlsx

## Recent Changes
**November 28, 2025** - Initial Replit setup
- Configured PostgreSQL database with automatic schema creation
- Set up required environment secrets (BOT_TOKEN, ADMIN_CHAT_ID, ADMIN_USER_ID)
- Installed npm dependencies (grammy, pg, xlsx, dotenv)
- Configured workflow to run bot with `npm start`
- Bot successfully started and connected to database

## Project Architecture

### File Structure
```
.
├── bot.js              # Main bot logic with all handlers
├── start.js            # Startup script with env validation & DB setup
├── setup-db.js         # Manual database setup utility
├── schema.sql          # Database schema definition
├── package.json        # Node.js dependencies
├── main.py             # Python utility (not currently used)
├── test_connection.py  # Python DB connection test
└── pyproject.toml      # Python dependencies
```

### Database Schema
The bot uses 4 main tables:
1. **masters** - Delivery personnel (name, phone, telegram_id, region)
2. **warehouse** - Product inventory (name, quantity, price, category, region)
3. **clients** - Customer information (name, phone, address)
4. **orders** - Delivery orders with tracking info, photos, GPS, warranty status

### Bot Features
**Admin Features**:
- Add new masters (delivery personnel)
- Create delivery orders
- Import products from Excel files
- View all masters and orders
- Manage warehouse inventory
- Receive notifications with photos

**Master Features**:
- View assigned orders
- View regional warehouse inventory
- Add products to regional warehouse
- Update order status with photos and GPS
- Handle warranty and spare parts workflow

### Key Workflows
1. **Order Creation**: Admin creates order → Selects master → Chooses product → Adds details → Master receives notification
2. **Excel Import**: Admin uploads Excel → Bot parses and imports/updates warehouse products
3. **Order Fulfillment**: Master views order → Updates status → Uploads before/after photos → Submits GPS location

## Environment Configuration

### Required Secrets (Already Set)
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `ADMIN_CHAT_ID` - Telegram chat ID for admin notifications
- `ADMIN_USER_ID` - Telegram user ID for admin access
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)

### Startup Process
The bot uses `start.js` which:
1. Validates all required environment variables
2. Connects to PostgreSQL database
3. Auto-creates database schema if tables are missing
4. Launches the bot from `bot.js`

## How to Use

### For Development
1. The bot is already running via the "Telegram Bot" workflow
2. Check logs in the Console tab to monitor bot activity
3. Interact with the bot on Telegram using the configured bot token

### Adding Your First Master
1. Contact the bot on Telegram
2. Admin must use `/addmaster` command or "➕ Usta qo'shish" button
3. Follow prompts to add master details (name, phone, telegram_id, region)
4. Master can now use @userinfobot to get their telegram_id

### Managing Warehouse
- Admin can add products manually or import via Excel
- Excel format supports multiple column name variations (Uzbek/English)
- Masters can view and add to regional warehouse inventory

## Technical Notes
- Bot uses in-memory sessions (Map) for conversation flows
- Supports multiple admins via comma-separated IDs
- Regional warehouse filtering for masters
- Photo and GPS location tracking for orders
- Warranty and spare parts workflow built-in
- Excel import supports various column naming conventions

## Deployment
This is a backend bot service (no frontend). The workflow is configured to run continuously using `npm start`.
