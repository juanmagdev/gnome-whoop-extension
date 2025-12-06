// whoopAuth.js - WHOOP OAuth2 with PKCE for GNOME Shell Extensions
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

const API_BASE = 'https://api.prod.whoop.com';
const REDIRECT_URI = 'http://localhost:8000/callback';
const SCOPE = 'offline read:recovery read:sleep read:workout read:cycles';

export class WhoopAuth {
    constructor() {
        this._session = new Soup.Session();
        this._codeVerifier = null;
        this._state = null;
    }

    // Generate random bytes using GLib
    _generateRandomBytes(length) {
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            bytes[i] = GLib.random_int_range(0, 256);
        }
        return bytes;
    }

    // Convert bytes to hex string
    _bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Base64 URL encode
    _base64urlEncode(data) {
        let base64;
        if (typeof data === 'string') {
            base64 = GLib.base64_encode(new TextEncoder().encode(data));
        } else if (data instanceof Uint8Array) {
            base64 = GLib.base64_encode(data);
        } else {
            base64 = GLib.base64_encode(data);
        }
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    // Generate code verifier (43-128 characters, URL-safe)
    _generateCodeVerifier() {
        const bytes = this._generateRandomBytes(32);
        return this._base64urlEncode(bytes);
    }

    // Generate code challenge using SHA256
    _generateCodeChallenge(codeVerifier) {
        const checksum = GLib.Checksum.new(GLib.ChecksumType.SHA256);
        checksum.update(new TextEncoder().encode(codeVerifier));
        const hashHex = checksum.get_string();
        
        // Convert hex string to bytes
        const hashBytes = new Uint8Array(hashHex.length / 2);
        for (let i = 0; i < hashHex.length; i += 2) {
            hashBytes[i / 2] = parseInt(hashHex.substr(i, 2), 16);
        }
        
        return this._base64urlEncode(hashBytes);
    }

    // Generate random state
    _generateState() {
        const bytes = this._generateRandomBytes(16);
        return this._bytesToHex(bytes);
    }

    // Build authorization URL
    buildAuthUrl(clientId) {
        this._codeVerifier = this._generateCodeVerifier();
        this._state = this._generateState();
        const codeChallenge = this._generateCodeChallenge(this._codeVerifier);

        const params = [
            `response_type=code`,
            `client_id=${encodeURIComponent(clientId)}`,
            `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
            `scope=${encodeURIComponent(SCOPE)}`,
            `state=${encodeURIComponent(this._state)}`,
            `code_challenge=${encodeURIComponent(codeChallenge)}`,
            `code_challenge_method=S256`
        ].join('&');

        return `${API_BASE}/oauth/oauth2/auth?${params}`;
    }

    // Get the current code verifier (needed for token exchange)
    getCodeVerifier() {
        return this._codeVerifier;
    }

    // Get the current state
    getState() {
        return this._state;
    }

    // Extract code from callback URL
    extractCodeFromCallback(callbackUrl) {
        try {
            // Parse URL manually since URL class might not be available
            const queryStart = callbackUrl.indexOf('?');
            if (queryStart === -1) {
                throw new Error('No query parameters found in callback URL');
            }

            const queryString = callbackUrl.substring(queryStart + 1);
            const params = {};
            
            queryString.split('&').forEach(pair => {
                const [key, value] = pair.split('=');
                params[decodeURIComponent(key)] = decodeURIComponent(value || '');
            });

            const code = params['code'];
            const state = params['state'];

            if (!code) {
                throw new Error('Authorization code not found in callback URL');
            }

            // State validation is optional but recommended
            if (this._state && state !== this._state) {
                console.warn('[WhoopAuth] State mismatch - proceeding anyway');
            }

            return code;
        } catch (error) {
            throw new Error(`Failed to extract code: ${error.message}`);
        }
    }

    // Exchange authorization code for tokens
    exchangeCodeForTokens(clientId, clientSecret, code) {
        return new Promise((resolve, reject) => {
            const url = `${API_BASE}/oauth/oauth2/token`;

            const formData = [
                `grant_type=authorization_code`,
                `code=${encodeURIComponent(code)}`,
                `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
                `client_id=${encodeURIComponent(clientId)}`,
                `client_secret=${encodeURIComponent(clientSecret)}`,
                `code_verifier=${encodeURIComponent(this._codeVerifier)}`
            ].join('&');

            const message = Soup.Message.new('POST', url);
            const encoder = new TextEncoder();
            message.set_request_body_from_bytes(
                'application/x-www-form-urlencoded',
                new GLib.Bytes(encoder.encode(formData))
            );

            this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        const decoder = new TextDecoder('utf-8');
                        const text = decoder.decode(bytes.get_data());
                        const response = JSON.parse(text);

                        if (response.error) {
                            reject(new Error(response.error_description || response.error));
                            return;
                        }

                        if (!response.access_token || !response.refresh_token) {
                            reject(new Error('Invalid response: missing tokens'));
                            return;
                        }

                        resolve({
                            client_id: clientId,
                            client_secret: clientSecret,
                            access_token: response.access_token,
                            refresh_token: response.refresh_token
                        });
                    } catch (e) {
                        reject(new Error(`Token exchange failed: ${e.message}`));
                    }
                }
            );
        });
    }
}
