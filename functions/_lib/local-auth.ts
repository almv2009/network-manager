const encoder = new TextEncoder();
const WORKERS_PBKDF2_ITERATION_LIMIT = 100000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

export function validateLocalPassword(password: string) {
  const normalized = String(password || "");
  if (normalized.length < 10) {
    return "Use a password with at least 10 characters.";
  }
  if (!/[A-Za-z]/.test(normalized) || !/[0-9]/.test(normalized)) {
    return "Use at least one letter and one number in the password.";
  }
  return "";
}

export async function createLocalPasswordCredential(password: string) {
  // Cloudflare Workers' WebCrypto PBKDF2 implementation rejects iteration counts above 100000.
  const iterations = WORKERS_PBKDF2_ITERATION_LIMIT;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return {
    passwordHash: bytesToBase64(hash),
    passwordSalt: bytesToBase64(salt),
    passwordIterations: iterations,
  };
}

export async function verifyLocalPasswordCredential(input: {
  password: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
}) {
  if (input.passwordIterations > WORKERS_PBKDF2_ITERATION_LIMIT) {
    return false;
  }
  const expectedHash = base64ToBytes(input.passwordHash);
  const salt = base64ToBytes(input.passwordSalt);
  const actualHash = await pbkdf2(input.password, salt, input.passwordIterations);
  return timingSafeEqual(expectedHash, actualHash);
}
