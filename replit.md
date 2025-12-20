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
- `orders` - Delivery orders with status tracking and payment details
- `clients` - Customer information

## Running the Bot
The bot runs via the "Telegram Bot" workflow which executes `node start.js`. It automatically:
1. Checks required environment variables
2. Connects to the database
3. Creates missing tables from schema.sql
4. Starts the Telegram bot

## Features

### Master Payment Breakdown
When an order is completed, the master receives a detailed payment breakdown showing:
- **Product Amount**: Total cost of products delivered
- **Distance Fee**: Based on actual distance traveled (3,000 so'm per km)
- **Work Fee**: Varies by work type (difficult: 150,000 so'm, normal: 100,000 so'm)
- **Total Payment**: Sum of all fees

The admin is also notified with the same payment details for tracking and financial management.

### Monthly Financial Reports
Admins can download monthly financial statements as Excel files:
- Access via "📊 Oylik hisobot" (Monthly Report) button in admin menu
- Select year and month
- File includes all orders with complete payment details and summary totals
- Columns include: Order ID, Master, Region, Client, Address, Product, Quantity, Status, Dates, Payment Details, Warranty Status

## Recent Changes
- December 20, 2025: Added payment breakdown notifications for masters and admins when orders are completed
- December 20, 2025: Initial Replit setup with PostgreSQL database and monthly report feature
