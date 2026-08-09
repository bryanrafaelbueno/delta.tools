#!/bin/sh
# Builds the web app and copies the dist into the api function directory so the
# @vercel/node bundler always includes it (GitHub CI runs this).
set -e
cd "$(dirname "$0")/../.."
npm run build -w web
mkdir -p api/.web-dist
cp -r web/dist/* api/.web-dist/
