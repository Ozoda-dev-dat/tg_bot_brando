# Telegram Delivery Bot

## Overview
A Telegram bot for managing delivery orders with location-based master assignment. Built with Node.js, Grammy (Telegram bot framework), and PostgreSQL.

**Current Status**: Project successfully imported and configured for Replit environment (November 28, 2025)

## Features
- 📦 Delivery order management
- 👷 Master (technician) management with GPS tracking
- 📍 Location-based master assignment (finds closest available master)
- 📊 Warehouse inventory management
- 📥 Excel import for bulk product updates
- 📸 Photo upload support (before/after photos)
- ✅ Order status tracking
- 🔐 Admin panel with special permissions

## Project Structure
```
├── bot.js           # Main bot logic with all handlers
├── start.js         # Startup script with env validation & DB setup
├── setup-db.js      # Manual database setup utility
├── schema.sql       # PostgreSQL schema (masters, orders, warehouse, clients)
├── main.py          # Simple Python test file (not used in main flow)
├── test_connection.py # Database connection test
└── package.json     # Node.js dependencies
```

## Environment Variables (Secrets)
The following secrets are required and configured:
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `ADMIN_USER_ID` - Telegram user ID of administrator(s) (comma-separated)
- `ADMIN_CHAT_ID` - Chat ID for admin notifications (comma-separated)
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)

## Database Schema
The bot uses PostgreSQL with 4 main tables:
1. **masters** - Technicians/service providers with GPS tracking
2. **warehouse** - Product inventory by region
3. **orders** - Delivery orders with status tracking
4. **clients** - Customer information

## How to Get Bot Token
1. Open Telegram and search for @BotFather
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the token provided
5. Update the BOT_TOKEN secret in Replit

**IMPORTANT**: The bot token must be valid. If you see a "404: Not Found" error, the token is incorrect or the bot was deleted. Create a new bot with @BotFather and update the BOT_TOKEN secret.

## How to Get Your User ID
1. Open Telegram and search for @userinfobot
2. Send any message to the bot
3. Copy your user ID
4. Update the ADMIN_USER_ID secret in Replit

## Workflow
- **Telegram Bot**: Runs `npm start` which validates environment variables, sets up database schema if needed, and starts the bot

## Recent Changes
- **2025-11-28**: Initial import and Replit environment setup
  - Installed Node.js dependencies (grammy, pg, dotenv, xlsx)
  - Configured PostgreSQL database
  - Database schema automatically created
  - Workflow configured to run bot via npm start
  - Environment secrets configured

## Next Steps
1. Verify your BOT_TOKEN is correct (create new bot if needed)
2. Update the secret in Replit
3. Restart the workflow
4. Test the bot by sending `/start` to your bot on Telegram

## User Preferences
- Language: Uzbek (bot messages are in Uzbek)
- Framework: Grammy (Telegram bot framework)
- Database: PostgreSQL with pg driver
