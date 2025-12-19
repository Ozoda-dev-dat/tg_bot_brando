# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management built with Node.js, grammy, and PostgreSQL. It manages masters (delivery workers), orders, warehouse inventory, and provides location-based assignment of orders to the nearest available master.

## Project Structure
- `bot.js` - Main bot logic with all handlers and business logic
- `start.js` - Entry point that checks environment variables, sets up database, and starts the bot
- `schema.sql` - PostgreSQL database schema
- `setup-db.js` - Manual database setup script

## Database Tables
- `masters` - Delivery workers with location tracking
- `warehouse` - Inventory management with regional support
- `clients` - Customer information
- `orders` - Order management with GPS tracking, photos, and payment calculation

## Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (automatically set by Replit)
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `ADMIN_CHAT_ID` - Telegram chat ID(s) for admin notifications (comma-separated for multiple)
- `ADMIN_USER_ID` - Telegram user ID(s) of administrator(s) (comma-separated for multiple)

## Running the Bot
The bot runs via `node start.js` which:
1. Validates required environment variables
2. Checks and creates database schema if needed
3. Starts the grammy Telegram bot

## Key Features
- Region-based master assignment (Uzbekistan regions)
- Location-based nearest master finding
- Order workflow with photo documentation (before/after)
- Warehouse inventory per region
- Excel import/export functionality
- Admin panel for management
- **Product Purchase Date Tracking**: Admin enters product purchase date during order creation
- **Automatic Warranty Calculation**: System calculates warranty status (valid if < 2 months, expired if >= 2 months)
- **Smart Work Fee System**:
  - If warranty is valid (< 2 months): Service is FREE
  - If warranty expired (>= 2 months): Master selects work type:
    - Easy work: 100,000 soums
    - Difficult work: 150,000 soums
- **Work Type Selection**: After arriving at customer location, master selects work difficulty level with warranty status displayed
