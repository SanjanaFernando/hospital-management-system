#!/bin/bash
# Quick script to seed the hospital-management database
# Make sure MONGODB_URI is set in .env.local first

export $(cat .env.local | grep MONGODB_URI | xargs)
node scripts/seedDatabase.mjs
