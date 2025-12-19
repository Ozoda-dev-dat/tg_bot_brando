# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management built with Grammy (Telegram Bot Framework) and PostgreSQL database.

## Project Structure
- `bot.js` - Main bot logic with handlers for orders, masters, warehouse management
- `start.js` - Entry point that checks environment and initializes database schema
- `schema.sql` - PostgreSQL database schema
- `setup-db.js` - Database setup utility

## Tech Stack
- Node.js 20
- Grammy - Telegram Bot Framework
- PostgreSQL (Replit Database)
- ExcelJS/XLSX - Excel file handling

## Required Environment Variables
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `ADMIN_CHAT_ID` - Telegram chat ID for admin notifications
- `ADMIN_USER_ID` - Telegram user ID of the administrator

## Running the Bot
The bot runs via the "Telegram Bot" workflow using `node start.js`.

## Database Tables
- `masters` - Delivery personnel information
- `warehouse` - Product inventory
- `clients` - Customer information
- `orders` - Delivery orders

## Recent Changes
- December 19, 2025: Initial import and setup in Replit environment
