# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management with PostgreSQL database integration. Built with Grammy (Telegram Bot Framework) and Node.js.

## Project Structure
- `bot.js` - Main bot logic with commands and handlers
- `start.js` - Entry point that checks environment and initializes database
- `schema.sql` - PostgreSQL database schema
- `setup-db.js` - Database setup utility

## Environment Variables Required
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `DATABASE_URL` - PostgreSQL connection string (auto-configured by Replit)
- `ADMIN_CHAT_ID` - Telegram chat ID(s) for admin notifications (comma-separated)
- `ADMIN_USER_ID` - Telegram user ID(s) of administrators (comma-separated)

## Running the Bot
The bot runs via the "Telegram Bot" workflow which executes `node start.js`.

## Features
- Master/technician management
- Order/delivery tracking
- Warehouse inventory management
- Location-based master assignment
- Excel import/export functionality
- Admin panel with statistics

## Recent Changes
- 2025-12-19: Initial import and setup in Replit environment
