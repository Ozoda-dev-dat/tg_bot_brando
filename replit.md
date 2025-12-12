# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management with PostgreSQL database integration. Built using grammy (Telegram bot framework) and pg (PostgreSQL client).

## Project Structure
- `bot.js` - Main bot logic with all commands and handlers
- `start.js` - Entry point that checks environment variables and database before starting the bot
- `schema.sql` - PostgreSQL database schema
- `setup-db.js` - Manual database setup script

## Database Tables
- **masters** - Delivery personnel with location tracking
- **warehouse** - Product inventory with regional stock
- **clients** - Customer information
- **orders** - Order management with status tracking

## Environment Variables (Secrets)
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `ADMIN_CHAT_ID` - Telegram chat ID(s) for admin notifications
- `ADMIN_USER_ID` - Telegram user ID(s) of administrators
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)

## Running the Bot
The bot runs via `npm start` which executes `start.js`. This script:
1. Validates required environment variables
2. Checks database connection
3. Creates missing tables if needed
4. Starts the bot

## Features
- Admin panel for order management
- Master (delivery personnel) tracking with GPS
- Regional warehouse management
- Excel import/export functionality
- Order assignment based on proximity
