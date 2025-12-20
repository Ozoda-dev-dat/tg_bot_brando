# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management using Grammy framework with PostgreSQL database. The bot manages orders, masters (delivery workers), warehouse inventory, and client information.

## Project Structure
- `start.js` - Main entry point that initializes database and starts the bot
- `bot.js` - Core bot logic with command handlers and business logic
- `schema.sql` - Database schema definitions
- `setup-db.js` - Database setup utility

## Tech Stack
- **Runtime**: Node.js 20
- **Bot Framework**: Grammy (Telegram Bot API)
- **Database**: PostgreSQL (Replit's built-in Neon-backed database)
- **Excel Support**: xlsx, exceljs for import/export functionality

## Environment Variables Required
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `ADMIN_USER_ID` - Telegram user ID(s) of admin(s), comma-separated
- `ADMIN_CHAT_ID` - Telegram chat ID(s) for admin notifications, comma-separated
- `DATABASE_URL` - PostgreSQL connection string (automatically set by Replit)

## Database Tables
- `masters` - Delivery workers with location tracking
- `warehouse` - Product inventory by region
- `orders` - Delivery orders with status tracking
- `clients` - Customer information

## Running the Bot
The bot runs via the "Telegram Bot" workflow which executes `node start.js`. It automatically:
1. Checks required environment variables
2. Connects to the database
3. Creates missing tables from schema.sql
4. Starts the Telegram bot

## Features
### Payment Breakdown
When an order is completed by a master:
- **Master receives**: A detailed payment breakdown showing:
  - Product total (quantity × price)
  - Distance fee (distance in km × 3,000 som/km)
  - Work fee (based on difficulty: 100,000 som for normal, 150,000 som for difficult)
  - **Total payment** due to the master
- **Admin receives**: The same breakdown to track payments and manage finances
- **Payment Details**: All breakdown info is stored in the database for reporting

## Recent Changes
- December 20, 2025: Initial Replit setup with PostgreSQL database
- December 20, 2025: Added payment breakdown feature with master and admin notifications
