# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management built with grammy (Telegram Bot Framework) and PostgreSQL (Replit Database). The bot helps manage delivery orders, masters (delivery personnel), warehouse inventory, and client information with financial tracking.

## Project Structure
- `bot.js` - Main bot logic with all commands and handlers
- `start.js` - Entry point that checks environment and starts the bot
- `setup-db.js` - Database schema setup utility
- `schema.sql` - PostgreSQL database schema

## Tech Stack
- **Runtime**: Node.js
- **Bot Framework**: grammy
- **Database**: PostgreSQL (Replit Database)
- **Excel Processing**: exceljs, xlsx

## Required Environment Variables
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `ADMIN_CHAT_ID` - Telegram chat ID(s) for admin notifications
- `ADMIN_USER_ID` - Telegram user ID(s) of administrators

## Database Tables
- `masters` - Delivery personnel with location tracking
- `warehouse` - Product inventory by region
- `orders` - Delivery orders with status tracking and financial info
- `clients` - Customer information

## Financial Features
- **Distance Fee**: 3,000 soums per km
- **Work Types**:
  - Easy work: 100,000 soums
  - Difficult work: 150,000 soums
- **Master sees**: Payment preview before accepting order
- **Master selects**: Work difficulty after sending first photo
- **Admin sees**: Total payment in notifications
- **Master receives**: Total payment summary after order completion

## Features
- Order management and tracking with financial calculations
- Master (delivery personnel) management
- Warehouse inventory by region
- Location-based order assignment with distance tracking
- Excel import/export functionality
- Admin panel with comprehensive notifications including payment info
- Work type selection (Easy/Difficult) with corresponding fees
- Financial breakdown for transparency

## Running the Bot
The bot runs via the workflow command: `node start.js`

The bot initializes database schema on startup if tables don't exist, and applies migrations for new financial fields.
