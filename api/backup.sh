#!/bin/bash
# JAKH.net V2 Automated Backup System
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="/var/www/jakh-backups/v2_$TIMESTAMP"

echo "Starting v2 backup at $TIMESTAMP..."
sudo mkdir -p "$BACKUP_DIR"
sudo cp -rv /var/www/jakh.net "$BACKUP_DIR/site"
sudo cp -rv /var/www/jakh.net-api "$BACKUP_DIR/api"

# Cleanup: Keep only last 7 backups
ls -dt /var/www/jakh-backups/* | tail -n +8 | xargs sudo rm -rf

echo "Backup completed: $BACKUP_DIR"
