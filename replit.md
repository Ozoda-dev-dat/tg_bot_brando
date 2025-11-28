# Telegram Delivery Bot

## Overview
A Telegram bot for managing delivery orders with location-based master assignment. The system manages masters (service workers), warehouse inventory, clients, and delivery orders with GPS tracking capabilities.

## Project Type
Backend Telegram Bot Application (Node.js)

## Tech Stack
- **Runtime**: Node.js
- **Bot Framework**: Grammy (Telegram Bot API)
- **Database**: PostgreSQL (Replit-managed)
- **Key Libraries**: 
  - `pg` - PostgreSQL client
  - `xlsx` - Excel file import/export
  - `dotenv` - Environment variable management

## Features
- Location-based master assignment (finds closest master to order)
- Warehouse inventory management with regional support
- Excel import for bulk product upload
- Order tracking with GPS coordinates
- Admin panel for managing masters, products, and orders
- Master location sharing and tracking
- Photo upload for before/after service documentation

## Database Schema

### Tables
1. **masters** - Service workers
   - Location tracking: `last_lat`, `last_lng`, `last_location_update`
   - Regional assignment support
   
2. **warehouse** - Product inventory
   - Regional inventory support
   - Category and subcategory classification
   
3. **orders** - Delivery orders
   - GPS tracking for order location and master location
   - Status tracking and photo documentation
   
4. **clients** - Customer information

### Functions
- `decrease_stock(p_name, p_qty)` - Automatically decrease warehouse quantity

## Setup Instructions

### 1. Create PostgreSQL Database
1. Open the Database pane in Replit
2. Create a new PostgreSQL database
3. The `DATABASE_URL` will be automatically set

### 2. Set Required Environment Variables
The following environment variables/secrets need to be configured:

**Required Secrets:**
- `BOT_TOKEN` - Get from [@BotFather](https://t.me/BotFather) on Telegram
- `ADMIN_USER_ID` - Your Telegram user ID (comma-separated for multiple admins)
- `ADMIN_CHAT_ID` - Telegram chat ID for admin notifications (comma-separated for multiple)

**Note**: `DATABASE_URL` is automatically set when you create the database

### 3. Get Your Telegram User ID
Send `/start` to [@userinfobot](https://t.me/userinfobot) on Telegram to get your user ID

### 4. Run the Bot
The bot will automatically:
- Check database connection
- Create tables if they don't exist
- Start listening for Telegram messages

## Project Structure
```
.
├── bot.js              # Main bot logic with all handlers
├── start.js            # Startup script with pre-flight checks
├── setup-db.js         # Database schema setup utility
├── schema.sql          # PostgreSQL schema definition
├── test_connection.py  # Python database connection test
├── main.py             # Python entry point (minimal)
└── package.json        # Node.js dependencies
```

## Usage

### Admin Commands
- `/start` - Access admin panel
- `+ Yangi yetkazish` - Create new delivery order
- `➕ Usta qo'shish` - Add new master
- `➕ Mahsulot qo'shish` - Add new product
- `📥 Excel import` - Import products from Excel
- `📋 Barcha buyurtmalar` - View all orders
- `👥 Barcha ustalar` - View all masters
- `📦 Ombor` - View warehouse inventory

### Master Commands
- `/start` - Share location and access menu
- `Mening buyurtmalarim` - View my orders
- `Ombor` - View available products
- `📦 Mahsulot qo'shish` - Add product to regional warehouse

### Excel Import Format
The Excel file should contain these columns (flexible naming):
- Name/Nomi/Mahsulot - Product name (required)
- Quantity/Miqdor/Soni - Stock quantity
- Price/Narx/Narxi - Product price
- Category/Kategoriya - Product category (optional)
- Region/Viloyat - Regional assignment (optional)

## Location-Based Features
The bot uses GPS coordinates to:
1. Find the closest available master to a new order
2. Track master locations (updates expire after 24 hours)
3. Calculate distance between orders and masters
4. Record completion GPS to verify service location

## Recent Changes
- **2025-11-28**: Initial setup for Replit environment
  - Added missing location tracking columns to masters table
  - Configured workflow for bot execution
  - Updated documentation

## User Preferences
- Language: Uzbek (Cyrillic script used in bot messages)
- Bot responses are in Uzbek for end users
- Admin interface uses Uzbek

## Development Notes
- The bot uses polling mode (not webhooks)
- Sessions are stored in memory (Map objects)
- Location data is cached in memory and persisted to database
- The startup script validates environment variables before launching
