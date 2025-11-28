# Telegram Delivery Bot

## Overview
A Telegram bot for managing delivery operations with support for orders, warehouse inventory, and master (delivery worker) management. Built with Grammy (Telegram bot framework) and PostgreSQL database.

## Project Type
Backend Telegram Bot Application (No Frontend)

## Technology Stack
- **Runtime**: Node.js 20.x
- **Bot Framework**: Grammy (Telegram Bot Framework)
- **Database**: PostgreSQL (Replit/Neon)
- **Key Libraries**: 
  - `grammy` - Telegram bot framework
  - `pg` - PostgreSQL client
  - `xlsx` - Excel file processing for inventory imports
  - `dotenv` - Environment variable management

## Project Structure
```
.
├── bot.js              # Main bot logic and handlers
├── start.js            # Startup script with validation
├── schema.sql          # Database schema
├── setup-db.js         # Database setup utility
├── package.json        # Node.js dependencies
└── main.py            # Python test file (not used in production)
```

## Database Schema
The bot uses 4 main tables:
- **masters** - Delivery workers with regions
- **warehouse** - Product inventory with regional support
- **orders** - Delivery orders with GPS tracking
- **clients** - Customer information

## Environment Variables (Required)
All stored in Replit Secrets:
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `ADMIN_CHAT_ID` - Telegram chat ID for admin notifications
- `ADMIN_USER_ID` - Telegram user ID of administrator(s)

## Features
1. **Order Management**
   - Create new delivery orders
   - Track order status
   - GPS location tracking for deliveries
   - Before/after photo uploads
   - Signature collection

2. **Warehouse Management**
   - Product inventory tracking by region
   - Excel import for bulk product updates
   - Category and subcategory support
   - Automatic stock deduction

3. **Master Management**
   - Regional delivery worker assignment
   - Location-based order notifications
   - Per-region inventory access

4. **Admin Features**
   - Add masters and products
   - View all orders and masters
   - Excel import for inventory
   - System-wide warehouse access

## Workflow Configuration
- **Name**: Telegram Bot
- **Command**: `npm start`
- **Type**: Console (backend service)
- **Auto-restart**: Enabled

## Setup Status
✅ Database created and schema initialized
✅ Environment variables configured
✅ npm dependencies installed
✅ Workflow configured and running
✅ Bot successfully started and listening

## Bot Commands
- `/start` - Initialize bot (for masters and admins)
- `/addmaster` - Add new master (admin only)

## Usage
The bot runs continuously in the background. Users interact with it through Telegram:
1. Masters can view assigned orders, check inventory, and add products to their region
2. Admins can create orders, manage masters, and import inventory via Excel

## Recent Changes
- **2025-11-28**: Initial import and Replit environment setup
  - Created PostgreSQL database with full schema
  - Configured environment variables
  - Set up workflow for continuous bot operation
  - Verified successful bot startup

## Language Support
Primary language: Uzbek (uz-UZ)
