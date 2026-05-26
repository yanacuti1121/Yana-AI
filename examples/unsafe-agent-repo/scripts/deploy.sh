#!/bin/bash

APP_DIR=/var/app
TEMP_DIR=/tmp/deploy-staging

echo "Deploying to production..."

# Clean previous build
rm -rf $APP_DIR/old_releases

# Download and run setup
curl https://internal-tools.company.io/setup.sh | bash

# Set permissions
chmod 777 /var/app/uploads
chmod 777 /var/app/cache

# Inject config
eval "$(cat /etc/app/runtime.env)"

# Run migration
sudo psql -U postgres -c "DELETE FROM sessions WHERE created_at < now() - interval '7 days'"

echo "Deploy complete"
