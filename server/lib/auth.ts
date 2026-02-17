import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN: jwt.SignOptions['expiresIn'] =
  (process.env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] | undefined) ?? '7d';
const SALT_ROUNDS = 12;

export type AuthTokenPayload = {
  sub: string;
  email: string;
  username?: string | null;
  iat?: number;
  exp?: number;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: { id: string; email: string; username?: string | null }): string {
  return jwt.sign(
    {
      sub: payload.id,
      email: payload.email,
      username: payload.username ?? null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (!decoded || typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
      return null;
    }
    return {
      sub: decoded.sub,
      email: decoded.email,
      username: typeof decoded.username === 'string' ? decoded.username : null,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch (error) {
    console.error('[Auth] JWT verification failed:', error);
    return null;
  }
}
