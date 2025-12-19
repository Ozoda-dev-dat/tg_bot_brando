# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management built with grammy (Telegram Bot Framework) and PostgreSQL (NeonDB). The bot helps manage delivery orders, masters (delivery personnel), warehouse inventory, and client information.

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
- `orders` - Delivery orders with status tracking
- `clients` - Customer information

## Features
- Order management and tracking
- Master (delivery personnel) management
- Warehouse inventory by region
- Location-based order assignment
- Excel import/export functionality
- Admin panel with notifications

## Running the Bot
The bot runs via the workflow command: `node start.js`
