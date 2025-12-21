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
