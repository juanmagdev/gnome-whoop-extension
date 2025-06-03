#!/bin/bash
read -p "Enter your CLIENT_ID: " CLIENT_ID
read -p "Enter your CLIENT_SECRET: " CLIENT_SECRET
echo

REDIRECT_URI="http://localhost:8000/callback"
SCOPE="offline read:recovery read:sleep read:workout read:cycles"

# Function for base64url encoding
base64url_encode() {
  openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

# Generate code_verifier
code_verifier=$(openssl rand -base64 32 | tr -d '\n' | base64url_encode)

# Generate code_challenge
code_challenge=$(printf '%s' "$code_verifier" | openssl dgst -sha256 -binary | base64url_encode)

# Generate a random state
state=$(openssl rand -hex 8)

# Build the authorization URL
auth_url="https://api.prod.whoop.com/oauth/oauth2/auth?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI&scope=$(echo $SCOPE | sed 's/ /%20/g')&state=$state&code_challenge=$code_challenge&code_challenge_method=S256"

echo -e "\n➡️  Open this URL in your browser to authorize the app:\n"
echo "$auth_url"
echo -e "\nAfter authorizing, you'll be redirected to a URL containing a \"code\" parameter."
echo "Copy and paste it here to continue.\n"

read -p "📥 Paste the \"code\" from the URL here: " code

# Request token
response=$(curl -s -X POST https://api.prod.whoop.com/oauth/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=$code" \
  -d "redirect_uri=$REDIRECT_URI" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "code_verifier=$code_verifier")

# Check and save tokens
if echo "$response" | jq -e '.access_token and .refresh_token' >/dev/null 2>&1; then
  echo -e "\n✅ Token successfully obtained:\n"
  echo "$response" | jq '.'

  access_token=$(echo "$response" | jq -r '.access_token')
  refresh_token=$(echo "$response" | jq -r '.refresh_token')

  # Create tokens.json
  cat > tokens.json <<EOF
{
  "client_id": "$CLIENT_ID",
  "client_secret": "$CLIENT_SECRET",
  "access_token": "$access_token",
  "refresh_token": "$refresh_token"
}
EOF

  echo -e "\n✅ tokens.json saved to $(pwd)/tokens.json\n"
else
  echo -e "\n❌ Error obtaining token:\n$response"
  exit 1
fi
