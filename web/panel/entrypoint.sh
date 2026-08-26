#!/bin/sh
cat > /usr/share/nginx/html/config.js <<EOF
window.__API_URL__ = "${API_URL}";
window.__PRINT_SERVER_URL__ = "${PRINT_SERVER_URL}";
EOF
nginx -g "daemon off;"
