# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management built with GrammY framework and PostgreSQL database. Designed for managing delivery orders, masters (delivery personnel), and warehouse inventory.

## Architecture
- **Runtime**: Node.js
- **Framework**: GrammY (Telegram Bot Framework)
- **Database**: PostgreSQL (Neon-backed via Replit)
- **Entry Point**: `start.js` → `bot.js`

## Project Structure
```
├── bot.js          # Main bot logic and handlers
├── start.js        # Startup script with database checks
├── setup-db.js     # Database schema setup utility
├── schema.sql      # PostgreSQL schema definitions
└── package.json    # Dependencies and scripts
```

## Database Tables
- `masters` - Delivery personnel with location tracking
- `warehouse` - Product inventory with regional stock
- `orders` - Delivery orders with full tracking
- `clients` - Customer information

## Required Environment Variables
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `ADMIN_CHAT_ID` - Telegram chat ID for admin notifications
- `ADMIN_USER_ID` - Telegram user ID of administrator(s)

## Running
The bot starts via `node start.js` which:
1. Checks environment variables
2. Verifies database connection
3. Creates missing tables from schema.sql
4. Starts the bot

## Features
- Multi-region delivery management
- Master location tracking
- Order assignment based on closest master
- Warehouse inventory management
- Excel import/export functionality
- Monthly reports

## Recent Changes (Current Session)

### Completed
1. ✅ **Service Center-Based Distance Calculation (Requirement #1)**
   - Added `service_centers` table to store service center locations
   - Modified `masters` table to reference service centers via `service_center_id`
   - Updated distance fee calculation to use service center coordinates instead of master's current location
   - Changes apply to: after_photo handler and order completion logic

### TODO - Remaining Requirements
2. ❌ **Product Inventory Tracking (Requirement #2)**
   - Need to track: incoming warehouse stock vs usage in orders
   - Implement stock decrease when products are used in orders

3. ❌ **Admin Daily Report Dashboard (Requirement #3)**
   - Daily orders created (count)
   - Orders by region/destination
   - Orders found/assigned (count)
   - Orders in progress (count)
   - Closed orders by master
   - Payment breakdown (km costs, labor, products) per master

4. ❌ **Master Panel Photo Workflow (Requirement #4)**
   - Remove "before photo" requirement
   - Keep only "after photo" for work completion
   - Simplify workflow from 2 photos to 1 photo

5. ❌ **Price Formatting (Requirement #5)**
   - Format all currency values with proper thousand separators
   - Example: 100,000 soums instead of 100000
