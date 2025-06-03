import crypto from 'crypto';
import readline from 'readline';

// Configura tus datos de aplicación
const CLIENT_ID = '86eabfcb-a2b2-4b44-869d-235f90f6fbb6';
const CLIENT_SECRET = '4375b699a1b98d8550d46a0dc6ca8dd6a07b4a05cda44dabeabd2a1d760257bc';
const REDIRECT_URI = 'http://localhost:8000/callback'; // Usa el que tengas registrado
const state = crypto.randomBytes(8).toString('hex'); // Genera un state seguro

// Funciones auxiliares para PKCE
function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

// Generar code verifier y challenge
const codeVerifier = base64URLEncode(crypto.randomBytes(32));
const codeChallenge = base64URLEncode(sha256(codeVerifier));


// Construir URL de autorización
const authURL = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
authURL.searchParams.set('response_type', 'code');
authURL.searchParams.set('client_id', CLIENT_ID);
authURL.searchParams.set('redirect_uri', REDIRECT_URI);
authURL.searchParams.set('scope', 'offline read:recovery read:sleep read:workout read:cycles');  // modifica scopes según necesidad
authURL.searchParams.set('state', state);
authURL.searchParams.set('code_challenge', codeChallenge);
authURL.searchParams.set('code_challenge_method', 'S256');

console.log('\n➡️  Abre esta URL en tu navegador para autorizar la app:\n');
console.log(authURL.href);
console.log('\nDespués de autorizar, serás redirigido a una URL que contiene el parámetro "code".');
console.log('Cópialo y pégalo aquí para continuar.\n');

// Leer input de usuario para el código
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('📥 Pega aquí el código "code" de la URL: ', async (code) => {
  try {
    // Intercambiar code por token
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
    });

    const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error al obtener token: ${JSON.stringify(errorData)}`);
    }

    const tokenData = await response.json();
    console.log('\n✅ Token obtenido correctamente:\n');
    console.log(tokenData);


    // Ejemplo: hacer una petición a la API WHOOP usando el access_token
    const apiResponse = await fetch('https://api.prod.whoop.com/users/me/recovery', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      }
    });

  } catch (err) {
    console.error('\n❌ Error:', err.message);
  } finally {
    rl.close();
  }
});

