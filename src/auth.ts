const ITERATIONS = 100000
const KEY_LENGTH = 32

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await deriveKey(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(derived)}`
}

export function isHashedPassword(stored: string): boolean {
  return stored.startsWith("pbkdf2$")
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iterStr, saltHex, hashHex] = stored.split("$")
  if (algo !== "pbkdf2") return false
  const iterations = parseInt(iterStr, 10)
  if (Number.isNaN(iterations) || iterations <= 0) return false
  const salt = fromHex(saltHex)
  const expected = fromHex(hashHex)
  const derived = await deriveKey(password, salt, iterations)
  if (derived.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < derived.length; i++) {
    diff |= derived[i] ^ expected[i]
  }
  return diff === 0
}
