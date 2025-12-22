# Telegram Delivery Bot

A Telegram bot for delivery management built with Grammy and PostgreSQL.

## Overview

This bot helps manage deliveries by:
- Tracking orders and assigning them to masters (technicians)
- Managing warehouse inventory
- Calculating distances and fees for deliveries
- Generating Excel reports
- Supporting multiple regions across Uzbekistan

## Project Structure

```
├── bot.js         # Main bot logic with Grammy handlers
├── start.js       # Entry point - checks env vars, sets up DB, starts bot
├── schema.sql     # PostgreSQL database schema
├── setup-db.js    # Database setup script
└── package.json   # Node.js dependencies
```

## Tech Stack

- **Runtime**: Node.js
- **Bot Framework**: Grammy (Telegram Bot API)
- **Database**: PostgreSQL (Replit built-in)
- **Excel Processing**: ExcelJS, XLSX

## Required Environment Variables

The following secrets must be set in the Secrets tab:

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `ADMIN_USER_ID` | Telegram user ID(s) of administrators (comma-separated) |
| `ADMIN_CHAT_ID` | Telegram chat ID(s) for admin notifications (comma-separated) |
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Replit) |

## Database Tables

- `service_centers` - Service center locations
- `masters` - Technicians/delivery personnel
- `warehouse` - Product inventory per region
- `clients` - Customer information
- `orders` - Order tracking with status, photos, GPS

## Running the Bot

The bot runs via the "Telegram Bot" workflow which executes `node start.js`. This script:
1. Checks environment variables
2. Verifies database connection
3. Creates missing tables from schema.sql
4. Starts the Grammy bot

## Bot Features

- Admin panel with order management
- Master (technician) location tracking
- Order assignment based on proximity
- Photo documentation (before/after)
- Excel import/export for inventory
- Regional warehouse management
- Distance-based fee calculation
