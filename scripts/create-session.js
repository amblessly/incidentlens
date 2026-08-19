const { createSessionToken, sessionCookieValue, SESSION_COOKIE_NAME } = require('./src/lib/auth/session');
const { getUserByEmail } = require('./src/lib/auth/current-user');

const user = getUserByEmail('luisonblessly@gmail.com');
if (!user) {
  console.error('User not found');
  process.exit(1);
}

console.log('User:', user.id, user.name, user.email);

const token = createSessionToken(user.id);
const cookie = sessionCookieValue(token);

console.log('');
console.log('Session cookie:');
console.log(cookie);
console.log('');
console.log('SESSION_COOKIE_NAME:', SESSION_COOKIE_NAME);
